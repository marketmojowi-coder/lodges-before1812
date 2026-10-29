// Fact bins: members add facts (pending); editors accept or reject them. Counts are live.
import { auth, db, role, memberNumber } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let bins = [], facts = [], cur = "", editor = false, me = null, sources = [], picked = new Set(), MEMBER_NO = "";

onAuthStateChanged(auth, async user => {
  if (!user) { location.href = "index.html"; return; }
  const r = await role(user);
  if (!r.member) { location.href = "index.html"; return; }
  me = user; editor = r.editor;
  try { MEMBER_NO = await memberNumber(user); } catch (_) {}
  $("who").textContent = `Signed in as ${user.email || user.displayName}${editor ? " (editor)" : ""}.`;
  onSnapshot(collection(db, "sources"), s => { sources = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));
    $("a-src").innerHTML = `<option value="">Another source (type the citation below)</option>` + sources.map(x => `<option value="${x.id}">${esc(x.short)}: ${esc(x.about || "")}</option>`).join(""); });
  onSnapshot(collection(db, "bins"), s => { bins = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)); draw(); });
  // Editors see every fact; members see accepted facts plus their own submissions.
  const q = editor ? collection(db, "facts") : query(collection(db, "facts"), where("status", "==", "accepted"));
  if (editor) onSnapshot(q, s => { facts = s.docs.map(d => ({ id: d.id, ...d.data() })); draw(); });
  else {
    let a = [], mine = [];
    const merge = () => { const m = new Map(); [...a, ...mine].forEach(f => m.set(f.id, f)); facts = [...m.values()]; draw(); };
    onSnapshot(q, s => { a = s.docs.map(d => ({ id: d.id, ...d.data() })); merge(); });
    onSnapshot(query(collection(db, "facts"), where("by", "==", user.uid)), s => { mine = s.docs.map(d => ({ id: d.id, ...d.data() })); merge(); });
  }
});

function draw() {
  const n = (b, st) => facts.filter(f => f.bin === b && (!st || f.status === st)).length;
  $("bins").innerHTML = bins.map(b => `<button type="button" class="bin${b.id === cur ? " on" : ""}" data-b="${b.id}"><b>${esc(b.name)}</b>
    <small>${esc(b.about || "")}<br>${n(b.id, "accepted")} accepted · ${n(b.id, "pending")} waiting · ${n(b.id, "rejected")} rejected</small></button>`).join("");
  $("bins").querySelectorAll("[data-b]").forEach(e => e.onclick = () => { cur = cur === e.dataset.b ? "" : e.dataset.b; draw(); });
  $("a-bin").innerHTML = bins.map(b => `<option value="${b.id}"${b.id === cur ? " selected" : ""}>${esc(b.name)}</option>`).join("");
  const acc = facts.filter(f => f.status === "accepted");
  $("tally").textContent = `${facts.length} facts in the bins: ${acc.length} accepted, about ${new Set(acc.map(f => f.man)).size} men, ${new Set(acc.map(f => f.year).filter(Boolean)).size} years.`;
  const st = $("fstat").value;
  const list = facts.filter(f => (!cur || f.bin === cur) && (!st || f.status === st)).sort((a, b) => (b.created?.seconds || 0) - (a.created?.seconds || 0));
  $("facts").innerHTML = list.length ? list.map(f => `<div class="fact"><span class="st ${f.status}">${f.status}</span>
    <p><b>${esc(f.man)}</b>${f.lodge ? " · " + esc(f.lodge) : ""}${f.year ? " · " + esc(f.year) : ""}</p><p>${esc(f.claim)}</p>
    <p class="tally"><b>Source:</b> ${esc(f.citation)}. <b>Held at:</b> ${esc(f.held_at)}. Added by ${editor || f.by === me.uid ? esc(f.by_name || "a member") : "a member"}${f.agent ? " (agent)" : ""}.</p>
    ${f.review_note ? `<p class="tally"><b>Review:</b> ${esc(f.review_note)}</p>` : ""}
    ${editor && f.status === "pending" ? `<label class="tally"><input type="checkbox" data-pick="${f.id}" ${picked.has(f.id) ? "checked" : ""}> select</label><div class="acts"><button data-a="accepted" data-f="${f.id}">Accept</button><button data-a="rejected" data-f="${f.id}">Reject</button></div>` : ""}</div>`).join("")
    : `<p class="tally">No facts here yet.</p>`;
  if (editor) { const pend = list.filter(f => f.status === "pending");
    if (pend.length) $("facts").insertAdjacentHTML("afterbegin", `<div class="acts" style="margin-bottom:8px"><button id="pickall">Select all ${pend.length} waiting</button><button id="accsel">Accept selected (${picked.size})</button></div>`);
    $("facts").querySelectorAll("[data-pick]").forEach(c => c.onchange = () => { c.checked ? picked.add(c.dataset.pick) : picked.delete(c.dataset.pick); draw(); });
    const pa = $("pickall"); if (pa) pa.onclick = () => { pend.forEach(f => picked.add(f.id)); draw(); };
    const as = $("accsel"); if (as) as.onclick = async () => { if (!picked.size || !confirm(`Accept ${picked.size} facts? They will count in the statistics at the next build.`)) return;
      let batch = writeBatch(db), n = 0; for (const id of picked) { batch.update(doc(db, "facts", id), { status: "accepted", reviewed_by: me.uid, reviewed: serverTimestamp() }); if (++n === 400) { await batch.commit(); batch = writeBatch(db); n = 0; } }
      if (n) await batch.commit(); picked.clear(); };
  }
  $("facts").querySelectorAll("[data-a]").forEach(b => b.onclick = async () => {
    const note = b.dataset.a === "rejected" ? prompt("Why? (shown with the fact)") || "" : "";
    await updateDoc(doc(db, "facts", b.dataset.f), { status: b.dataset.a, review_note: note, reviewed_by: me.uid, reviewed: serverTimestamp() });
  });
}
$("fstat").onchange = draw;
// Oxford-style citation from a printed source: Author, Title, vol. N (Place, year), p. N.
const srcOf = id => sources.find(x => x.id === id);
function oxford(src, vol, page) {
  const m = src.cite.match(/^(.*?), (\d+ vols\. )?\((.*)\)$/); const head = m ? m[1] : src.cite, pub = m ? m[3] : "";
  return `${head}${src.volumes.length > 1 && vol ? `, vol. ${vol}` : ""}${pub ? ` (${pub})` : ""}${page ? `, p. ${page}` : ""}`;
}
function fillCite() { const s = srcOf($("a-src").value); $("a-vp").style.display = s ? "grid" : "none"; if (!s) return;
  if (!$("a-vol").options.length || $("a-vol").dataset.s !== s.id) { $("a-vol").innerHTML = s.volumes.map(v => `<option>${v}</option>`).join(""); $("a-vol").dataset.s = s.id; }
  $("a-cite").value = oxford(s, $("a-vol").value, $("a-page").value.trim()); $("a-held").value = s.held_at; }
["a-src", "a-vol"].forEach(id => $(id).onchange = fillCite); $("a-page").oninput = fillCite;
// Bulk CSV: one pending fact per line
function parseCSV(t) { const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; } else f += c; }
  if (f || row.length) { row.push(f); rows.push(row); } return rows.filter(r => r.some(x => x.trim())); }
$("tpl").onclick = e => { e.preventDefault(); const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["bin,source,volume,page,man,lodge,year,claim\nrolls,schultz,2,245,John Smith,Federal No. 15,1795,Junior Warden on the return of 1795\n"], { type: "text/csv" })); a.download = "facts_template.csv"; a.click(); };
$("bulk").onsubmit = async e => { e.preventDefault(); const rows = parseCSV(await $("b-file").files[0].text()); const h = rows.shift().map(x => x.trim().toLowerCase());
  const need = ["bin", "source", "volume", "page", "man", "claim"]; const miss = need.filter(k => !h.includes(k)); if (miss.length) { $("b-msg").textContent = "Missing columns: " + miss.join(", "); return; }
  let ok = 0, bad = []; let batch = writeBatch(db), n = 0;
  for (const [j, r] of rows.entries()) { const v = k => (r[h.indexOf(k)] || "").trim(); const s = srcOf(v("source").toLowerCase());
    if (!s || !v("man") || !v("claim") || !v("page") || !bins.some(b => b.id === v("bin")) || (v("year") && !/^1[78]\d\d$/.test(v("year")))) { bad.push(j + 2); continue; }
    batch.set(doc(collection(db, "facts")), { bin: v("bin"), source: s.id, volume: v("volume"), page: v("page"), man: v("man"), lodge: v("lodge"), year: v("year"), claim: v("claim"),
      citation: oxford(s, v("volume"), v("page")), held_at: s.held_at, status: "pending", by: me.uid, by_name: MEMBER_NO, agent: false, created: serverTimestamp() });
    ok++; if (++n === 400) { await batch.commit(); batch = writeBatch(db); n = 0; } }
  if (n) await batch.commit();
  $("b-msg").textContent = `${ok} facts are in the bins for review.${bad.length ? ` Not added (check bin, source, page, man, fact, year): lines ${bad.slice(0, 20).join(", ")}${bad.length > 20 ? "…" : ""}.` : ""}`; };
$("add").onsubmit = async e => {
  e.preventDefault();
  const v = id => $(id).value.trim();
  if (v("a-year") && !/^1[78]\d\d$/.test(v("a-year"))) { $("a-msg").textContent = "Year must be four digits, e.g. 1795."; return; }
  await addDoc(collection(db, "facts"), { source: v("a-src"), volume: v("a-src") ? v("a-vol") : "", page: v("a-src") ? v("a-page") : "", bin: v("a-bin"), man: v("a-man"), lodge: v("a-lodge"), year: v("a-year"), claim: v("a-claim"),
    citation: v("a-cite"), held_at: v("a-held"), status: "pending", by: me.uid, by_name: MEMBER_NO, agent: false,
    created: serverTimestamp() });
  $("add").reset(); $("a-msg").textContent = "In the bin. An editor will check it against the source.";
};
