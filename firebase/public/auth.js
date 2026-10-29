// Sign-in gate: Google or email link; members get the data set from Cloud Storage and the search app starts.
import { auth, db, storage, role, memberPrice, priceText, memberNumber } from "./firebase-init.js";
import { GoogleAuthProvider, signInWithPopup, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, signInWithEmailAndPassword, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, getBlob } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
const $ = id => document.getElementById(id), msg = t => { $("g-msg").textContent = t };
// Inside the Google Play app (Trusted Web Activity, started with ?source=twa) there is no purchase button and no link to buy:
// Google Play rules allow members to sign in to content bought elsewhere, but not to steer users to outside payment.
const ANDROID_APP = (() => { try { if (new URLSearchParams(location.search).get("source") === "twa") sessionStorage.setItem("twa", "1"); return sessionStorage.getItem("twa") === "1" || document.referrer.startsWith("android-app://"); } catch (_) { return false; } })();

if (isSignInWithEmailLink(auth, location.href)) {
  let email = localStorage.getItem("signin-email") || prompt("Confirm your email address");
  signInWithEmailLink(auth, email, location.href).then(() => history.replaceState(null, "", location.pathname)).catch(e => msg(e.message));
}
$("g-google").onclick = () => signInWithPopup(auth, new GoogleAuthProvider()).catch(e => msg(e.message));
$("g-email").onsubmit = e => {
  e.preventDefault(); const email = $("g-addr").value.trim();
  sendSignInLinkToEmail(auth, email, { url: location.origin + location.pathname, handleCodeInApp: true })
    .then(() => { try { localStorage.setItem("signin-email", email) } catch (_) {} msg("Check your email for the sign-in link."); })
    .catch(e => msg(e.message));
};
$("g-pw").onsubmit = e => {
  e.preventDefault();
  signInWithEmailAndPassword(auth, $("g-pw-addr").value.trim(), $("g-pw-pass").value)
    .catch(() => msg("That email and password do not match an account. Try Google or an email link, or set a password on the My account page."));
};
// Offline copy (the Android app should work with no signal): after each download the data set is kept on this device in
// IndexedDB for the signed-in member only. It is used when the network or the membership check cannot be reached, replaced
// on the next download, and deleted at sign-out or when the account is no longer a member.
const idb = () => new Promise((res, rej) => { const q = indexedDB.open("civic-vault", 1); q.onupgradeneeded = () => q.result.createObjectStore("data"); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
async function keep(uid, text) { try { const d = await idb(); d.transaction("data", "readwrite").objectStore("data").put({ uid, text, at: Date.now() }, "set"); } catch (_) {} }
async function kept(uid) { try { const d = await idb(); return await new Promise(res => { const q = d.transaction("data").objectStore("data").get("set"); q.onsuccess = () => res(q.result && q.result.uid === uid ? q.result : null); q.onerror = () => res(null); }); } catch (_) { return null; } }
async function forget() { try { const d = await idb(); d.transaction("data", "readwrite").objectStore("data").delete("set"); } catch (_) {} }
const out = () => forget().then(() => signOut(auth)); $("g-out").onclick = out; $("signout").onclick = out;

let PRICE = null;
$("g-buy").onclick = async () => {
  PRICE = PRICE || await memberPrice();
  if (!PRICE) { msg("Memberships are not on sale yet. Please try again soon."); return; }
  msg("Opening checkout…");
  const s = await addDoc(collection(db, "customers", auth.currentUser.uid, "checkout_sessions"),
    { price: PRICE.id, success_url: location.href, cancel_url: location.href });
  onSnapshot(s, snap => { const { url, error } = snap.data() || {}; if (error) msg(error.message); if (url) location.assign(url); });
};

let started = false;
onAuthStateChanged(auth, async user => {
  $("gate-out").hidden = !!user; $("gate-sub").hidden = true;
  if (!user) { $("gate").hidden = false; $("app").hidden = true; return; }
  let r;
  try { r = await role(user); }
  catch (_) { const c = await kept(user.uid); if (c) { startWith(c, true); return; } msg("No connection. Connect once to sign in and save the records on this device."); return; }
  if (!r.member) { forget();
    $("g-who").textContent = user.email || user.displayName; $("gate-sub").hidden = false;
    if (ANDROID_APP) { $("g-buy").hidden = true; $("g-note").textContent = "This account does not have a membership."; }
    else { PRICE = await memberPrice(); if (PRICE && priceText(PRICE)) $("g-buy").textContent = `Become a member · ${priceText(PRICE)}`; }
    return;
  }
  try { window.LB_MEMBER_NO = await memberNumber(user); } catch (_) {}
  msg("Loading the records…");
  try { const text = await (await getBlob(ref(storage, "data/data.json"))).text(); keep(user.uid, text); startWith({ text }, false); }
  catch (_) { const c = await kept(user.uid); if (c) startWith(c, true); else msg("The records could not be loaded. Check your connection and try again."); }
});
function startWith(c, offline) {
  const DATA = JSON.parse(c.text);
  $("gate").hidden = true; $("app").hidden = false; msg("");
  if (offline) { const n = document.createElement("p"); n.className = "offline-note"; n.setAttribute("role", "status");
    n.textContent = `Offline: showing the copy saved on this device${c.at ? " on " + new Date(c.at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : ""}. Contributions and account changes need a connection.`;
    document.getElementById("app").prepend(n); }
  if (!started) { started = true; window.startApp(DATA); }
}

// "Suggest a correction" in the Atlas job site: goes to the corrections bin as a pending fact for the editor.
window.LB_SUGGEST = async (s) => {
  const u = auth.currentUser; if (!u) throw new Error("Sign in first.");
  await addDoc(collection(db, "facts"), { bin: "corrections", man: s.man || "", lodge: s.lodge || "", year: s.year || "", claim: s.claim, citation: s.citation,
    held_at: s.held_at, source: "", volume: "", page: "", status: "pending", by: u.uid, by_name: window.LB_MEMBER_NO || "", agent: false, created: serverTimestamp() });
};
