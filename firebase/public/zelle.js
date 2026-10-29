// Pay $9.99 once: by Zelle, or through the owner's GoDaddy checkout link (and PayPal, if the owner sets a link). The payee details come from the database (config/zelle) and are shown only to a signed-in
// buyer. The buyer sends the payment with a memo reference and files a claim; an editor confirms it, and the
// membership opens (functions/index.js). The Google Play app never shows this (Play rules on outside payment).
import { db } from "./firebase-init.js";
import { doc, getDoc, setDoc, onSnapshot, collection, query, where, getDocs, updateDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = c => (c / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
const STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
// Sales tax by the buyer's state, as set by the owner in config/zelle (tax: {WI: 0.05, ...}); amounts in cents.
export const taxFor = (cfg, st) => Math.round((cfg.amount || 999) * ((cfg.tax || {})[st] || 0));
export const zelleRef = uid => "CA" + uid.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase();

// The buyer's side: a button, then the payee, the memo reference and "I have sent it".
export async function zelleBox(box, user, say) {
  let cfg = null;
  try { const c = await getDoc(doc(db, "config", "zelle")); cfg = c.exists() ? c.data() : null; } catch (_) {}
  if (!cfg) { box.innerHTML = ""; return false; }
  const ref = zelleRef(user.uid), claimDoc = doc(db, "zelle_claims", user.uid);
  const draw = claim => {
    if (claim && claim.status === "pending") {
      box.innerHTML = `<p class="zl-note"><b>Payment sent.</b> Reference ${esc(ref)}. Your membership opens as soon as it is confirmed, usually within a day; this page updates by itself.</p>`;
      return;
    }
    if (claim && claim.status === "paid") { box.innerHTML = `<p class="zl-note"><b>Payment confirmed.</b> Opening Civic Atlas…</p>`; setTimeout(() => location.reload(), 2500); return; }
    const links = [["zelle", "Pay with Zelle", null], ["godaddy", "Pay with GoDaddy checkout", cfg.godaddy], ["paypal", "Pay with PayPal", cfg.paypal]]
      .filter(([m, , u]) => m === "zelle" ? cfg.to : /^https:\/\//.test(u || ""));
    box.innerHTML = `<p class="zl-note"><b>${esc(money(cfg.amount || 999))}, paid once.</b> Choose how to pay:</p>` + links.map(([m, t]) => `<button class="zl-btn zl-${m}" type="button" data-m="${m}">${t}</button>`).join("")
      + (claim && claim.status === "not_found" ? `<p class="zl-note">We could not find your last payment. Check the reference and try again, or write to the contact address.</p>` : "");
    box.querySelectorAll("[data-m]").forEach(b => b.onclick = () => open(b.dataset.m));
  };
  const open = method => {
      const how = method === "zelle"
        ? `<p><b>2.</b> In your bank's app, send <b class="zl-amt">${esc(money(cfg.amount || 999))}</b> with Zelle to <b>${esc(cfg.to)}</b> (${esc(cfg.name)}).</p>
           <p><b>3.</b> In the memo, write <b class="zl-ref">${esc(ref)}</b> so we can match it to your account.</p>`
        : `<p><b>2.</b> <a class="zl-go" href="${esc(method === "godaddy" ? cfg.godaddy : cfg.paypal)}" target="_blank" rel="noopener">Open the secure ${method === "godaddy" ? "GoDaddy" : "PayPal"} checkout ↗</a> and pay <b class="zl-amt">${esc(money(cfg.amount || 999))}</b>.</p>
           <p><b>3.</b> In the note or reference box, write <b class="zl-ref">${esc(ref)}</b> so we can match it to your account.</p>`;
      box.innerHTML = `<div class="zl-card">
        <p><b>1.</b> Choose your state: <select id="zl-st" aria-label="Your state"><option value="">Choose…</option>${STATES.map(s => `<option>${s}</option>`).join("")}<option value="XX">Outside the US</option></select></p>
        <p id="zl-sum"></p>${how}
        <p><b>4.</b> Then tell us below. Your membership opens when the payment is confirmed.</p>
        <form id="zl-form"><input id="zl-name" required minlength="2" maxlength="80" placeholder="Name on your payment" autocomplete="name"><button type="submit">I have paid</button></form>
        <button class="linkbtn" type="button" id="zl-back">Choose another way to pay</button>
        <p class="zl-note">One payment, no renewals. Your card or bank details go only to ${method === "zelle" ? "your bank" : method === "godaddy" ? "GoDaddy's secure checkout" : "PayPal"}; they never reach Civic Atlas.</p></div>`;
      box.querySelector("#zl-back").onclick = () => draw(null);
      const st = box.querySelector("#zl-st"), sum = () => { const t = taxFor(cfg, st.value), p = cfg.amount || 999;
        box.querySelectorAll(".zl-amt").forEach(x => x.textContent = money(p + t));
        box.querySelector("#zl-sum").textContent = st.value ? `Civic Atlas membership ${money(p)}${t ? ` + ${st.value} sales tax ${money(t)}` : ""} = ${money(p + t)}` : ""; };
      st.onchange = sum;
      box.querySelector("#zl-form").onsubmit = async e => {
        e.preventDefault();
        if (!st.value) { say("Choose your state first, so the right sales tax is added."); return; }
        const tax = taxFor(cfg, st.value), price = cfg.amount || 999;
        try { await setDoc(claimDoc, { ref, name: box.querySelector("#zl-name").value.trim(), email: user.email || "", state: st.value, method, price, tax, total: price + tax, status: "pending", created: serverTimestamp() }); }
        catch (x) { say("The payment notice could not be sent: " + x.message); }
      };
  };
  onSnapshot(claimDoc, s => draw(s.exists() ? s.data() : null), () => draw(null));
  return true;
}

// The editor's side (My account): Zelle payments waiting to be matched against the bank statement.
export async function zelleReview(box) {
  let rows = [];
  try { rows = (await getDocs(query(collection(db, "zelle_claims"), where("status", "==", "pending")))).docs.map(d => ({ id: d.id, ...d.data() })); } catch (_) { return; }
  if (!rows.length) { box.innerHTML = `<p class="note">No payments are waiting.</p>`; return; }
  box.innerHTML = `<p class="note">Match each reference and amount with the memo in your bank, GoDaddy or PayPal account, then confirm it.</p>` + rows.map(r => `<div class="fact"><p><b>${esc(r.ref)}</b> · ${esc(({ zelle: "Zelle", godaddy: "GoDaddy", paypal: "PayPal" })[r.method] || "Zelle")} · ${esc(money(r.total || 999))}${r.tax ? ` (tax ${esc(money(r.tax))}, ${esc(r.state)})` : ""} · ${esc(r.name)} · ${esc(r.email)}</p>
    <button class="btn main" type="button" data-ok="${esc(r.id)}">Confirm paid</button><button class="btn" type="button" data-no="${esc(r.id)}">Not found</button></div>`).join("");
  const set = (id, status) => updateDoc(doc(db, "zelle_claims", id), { status, checked: serverTimestamp() }).then(() => zelleReview(box)).catch(e => alert(e.message));
  // Confirm paid: in one step, mark the claim, let the member in (paid/{uid}) and write the sale to the ledger. Works on
  // the free Spark plan; on Blaze, functions/index.js also sets the member claim and writes the same ledger row.
  const confirm = id => { const r = rows.find(x => x.id === id), m = ({ zelle: "Zelle", godaddy: "GoDaddy checkout", paypal: "PayPal" })[r.method] || "Zelle";
    const b = writeBatch(db);
    b.update(doc(db, "zelle_claims", id), { status: "paid", checked: serverTimestamp() });
    b.set(doc(db, "paid", id), { at: serverTimestamp(), method: m, ref: r.ref || "", total: r.total || 999 });
    b.set(doc(db, "sales", "zelle_" + id), { sku: "CA-MEMBER-1", product: "Civic Atlas membership (one-time)", method: m, uid: id, email: r.email || "", name: r.name || "",
      state: r.state || "", price: r.price || 999, tax: r.tax || 0, total: r.total || 999, currency: "usd", ref: r.ref || "", recorded: serverTimestamp() }, { merge: true });
    return b.commit().then(() => zelleReview(box)).catch(e => alert(e.message)); };
  box.querySelectorAll("[data-ok]").forEach(b => b.onclick = () => confirm(b.dataset.ok));
  box.querySelectorAll("[data-no]").forEach(b => b.onclick = () => set(b.dataset.no, "not_found"));
}
