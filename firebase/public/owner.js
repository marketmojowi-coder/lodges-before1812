// Owner tools (Market Mojo LLC only, by confirmed email; the database rules enforce it): load the records and set the
// payment buttons from My account. No scripts, no private keys.
import { db } from "./firebase-init.js";
import { doc, getDoc, getDocs, collection, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SIZE = 600000; // characters per part; each database document must stay under 1 MB

export async function ownerTools(box) {
  let cfg = {};
  try { const c = await getDoc(doc(db, "config", "zelle")); if (c.exists()) cfg = c.data(); } catch (_) {}
  let parts = 0; try { parts = (await getDocs(collection(db, "data"))).size; } catch (_) {}
  const tax = Object.entries(cfg.tax || { WI: 0.05 }).map(([k, v]) => `${k}=${v}`).join(" ");
  box.innerHTML = `
    <h3>1. Records</h3>
    <p class="note" id="ow-dnote">${parts ? `Records are loaded (${parts} parts). Load a newer file to replace them.` : "No records loaded yet. Choose app_data.json."}</p>
    <input type="file" id="ow-file" accept=".json,application/json"> <button class="btn main" type="button" id="ow-up">Load records</button>
    <h3>2. Payment buttons</h3>
    <form id="ow-pay" class="owform">
      <label>Zelle email or phone <input id="ow-to" value="${esc(cfg.to)}" placeholder="pay@example.com"></label>
      <label>Name buyers see <input id="ow-name" value="${esc(cfg.name || "Market Mojo LLC")}"></label>
      <label>Price in dollars <input id="ow-amt" inputmode="decimal" value="${esc(((cfg.amount || 999) / 100).toFixed(2))}"></label>
      <label>Sales tax by state <input id="ow-tax" value="${esc(tax)}" placeholder="WI=0.05"></label>
      <label>GoDaddy Pay Link (optional) <input id="ow-gd" value="${esc(cfg.godaddy)}" placeholder="https://…"></label>
      <label>PayPal link (optional) <input id="ow-pp" value="${esc(cfg.paypal)}" placeholder="https://paypal.me/…"></label>
      <button class="btn main" type="submit">Save payment buttons</button>
    </form>
    <p class="note" id="ow-pnote">${cfg.to ? "Buyers see these buttons now." : "Buyers see no payment button until you save this."}</p>`;
  const $ = id => box.querySelector("#" + id);
  $("ow-up").onclick = async () => {
    const f = $("ow-file").files[0]; if (!f) { $("ow-dnote").textContent = "Choose the app_data.json file first."; return; }
    $("ow-dnote").textContent = "Checking the file…";
    const text = await f.text(); let d;
    try { d = JSON.parse(text); if (!d.meta || !Array.isArray(d.recs) || d.meta.count !== d.recs.length) throw 0; }
    catch (_) { $("ow-dnote").textContent = "That is not the Civic Atlas records file."; return; }
    const n = Math.ceil(text.length / SIZE);
    try {
      const old = (await getDocs(collection(db, "data"))).docs.map(x => x.id);
      for (let i = 0; i < n; i++) { const b = writeBatch(db); b.set(doc(db, "data", "part" + String(i).padStart(3, "0")), { i, n, t: text.slice(i * SIZE, (i + 1) * SIZE) }); await b.commit();
        $("ow-dnote").textContent = `Loading… part ${i + 1} of ${n}`; }
      const keep = new Set([...Array(n)].map((_, i) => "part" + String(i).padStart(3, "0")));
      const b = writeBatch(db); old.filter(id => !keep.has(id)).forEach(id => b.delete(doc(db, "data", id))); await b.commit();
      $("ow-dnote").textContent = `Done: ${d.recs.length.toLocaleString()} records loaded in ${n} parts. Members get them at their next sign-in.`;
    } catch (e) { $("ow-dnote").textContent = "Loading stopped: " + e.message; }
  };
  $("ow-pay").onsubmit = async e => {
    e.preventDefault();
    const to = $("ow-to").value.trim(), amount = Math.round(parseFloat($("ow-amt").value) * 100);
    if (!to || !(amount > 0)) { $("ow-pnote").textContent = "Enter your Zelle email or phone and a price."; return; }
    const tx = {}; for (const p of $("ow-tax").value.split(/[\s,]+/).filter(Boolean)) { const [k, v] = p.split("="); if (/^[A-Za-z]{2}$/.test(k) && +v >= 0 && +v < 0.2) tx[k.toUpperCase()] = +v; }
    const data = { to, name: $("ow-name").value.trim() || "Market Mojo LLC", amount, tax: tx };
    for (const [id, key] of [["ow-gd", "godaddy"], ["ow-pp", "paypal"]]) { const v = $(id).value.trim(); if (v) { if (!/^https:\/\//.test(v)) { $("ow-pnote").textContent = "Links must start with https://"; return; } data[key] = v; } }
    try { const b = writeBatch(db); b.set(doc(db, "config", "zelle"), data); await b.commit(); $("ow-pnote").textContent = "Saved. Buyers see these buttons now."; }
    catch (x) { $("ow-pnote").textContent = "Not saved: " + x.message; }
  };
}
