// Fact bins: members add facts (pending); editors accept or reject them. Counts are live.
import { auth, db, role } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let bins = [], facts = [], cur = "", editor = false, me = null;

onAuthStateChanged(auth, async user => {
  if (!user) { location.href = "index.html"; return; }
  const r = await role(user);
  if (!r.member) { location.href = "index.html"; return; }
  me = user; editor = r.editor;
  $("who").textContent = `Signed in as ${user.email || user.displayName}${editor ? " (editor)" : ""}.`;
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
    <p class="tally"><b>Source:</b> ${esc(f.citation)}. <b>Held at:</b> ${esc(f.held_at)}. Added by ${esc(f.by_name || f.by)}${f.agent ? " (agent)" : ""}.</p>
    ${f.review_note ? `<p class="tally"><b>Review:</b> ${esc(f.review_note)}</p>` : ""}
    ${editor && f.status === "pending" ? `<div class="acts"><button data-a="accepted" data-f="${f.id}">Accept</button><button data-a="rejected" data-f="${f.id}">Reject</button></div>` : ""}</div>`).join("")
    : `<p class="tally">No facts here yet.</p>`;
  $("facts").querySelectorAll("[data-a]").forEach(b => b.onclick = async () => {
    const note = b.dataset.a === "rejected" ? prompt("Why? (shown with the fact)") || "" : "";
    await updateDoc(doc(db, "facts", b.dataset.f), { status: b.dataset.a, review_note: note, reviewed_by: me.uid, reviewed: serverTimestamp() });
  });
}
$("fstat").onchange = draw;
$("add").onsubmit = async e => {
  e.preventDefault();
  const v = id => $(id).value.trim();
  if (v("a-year") && !/^1[78]\d\d$/.test(v("a-year"))) { $("a-msg").textContent = "Year must be four digits, e.g. 1795."; return; }
  await addDoc(collection(db, "facts"), { bin: v("a-bin"), man: v("a-man"), lodge: v("a-lodge"), year: v("a-year"), claim: v("a-claim"),
    citation: v("a-cite"), held_at: v("a-held"), status: "pending", by: me.uid, by_name: me.email || me.displayName, agent: false,
    created: serverTimestamp() });
  $("add").reset(); $("a-msg").textContent = "In the bin. An editor will check it against the source.";
};
