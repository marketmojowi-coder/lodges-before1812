// Sign-in gate: Google or email link; members get the data set from Cloud Storage and the search app starts.
import { auth, db, storage, role, memberPrice, priceText, memberNumber, signedInBadge } from "./firebase-init.js";
import { zelleBox } from "./zelle.js";
import { GoogleAuthProvider, signInWithPopup, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendEmailVerification, onAuthStateChanged, signOut,
  getMultiFactorResolver, TotpMultiFactorGenerator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, onSnapshot, getDocs, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, getBlob } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
const $ = id => document.getElementById(id), msg = t => { $("g-msg").textContent = t };
// Inside the Google Play app (Trusted Web Activity, started with ?source=twa) there is no purchase button and no link to buy:
// Google Play rules allow members to sign in to content bought elsewhere, but not to steer users to outside payment.
const ANDROID_APP = (() => { try { if (new URLSearchParams(location.search).get("source") === "twa") sessionStorage.setItem("twa", "1"); return sessionStorage.getItem("twa") === "1" || document.referrer.startsWith("android-app://"); } catch (_) { return false; } })();

// Opening screen: the Market Mojo film (intro.mp4, if present) or the Civic Atlas emblem, once per visit; Skip ends it.
(() => {
  const box = $("intro"); let seen = false; try { seen = sessionStorage.getItem("intro") === "1"; sessionStorage.setItem("intro", "1"); } catch (_) {}
  if (!box) return;
  if (seen || matchMedia("(prefers-reduced-motion: reduce)").matches) { box.remove(); return; }
  const end = () => { box.classList.add("out"); setTimeout(() => box.remove(), 500); };
  box.hidden = false; $("intro-skip").onclick = end;
  const v = $("intro-v"); let t = setTimeout(end, 3200);
  v.onloadeddata = () => { clearTimeout(t); box.classList.add("film"); v.play().catch(() => {}); t = setTimeout(end, 15000); };
  v.onended = end; v.onerror = () => {}; v.src = "intro.mp4";
})();

// Two-step sign-in: when the account has an authenticator app, Firebase asks for its six-digit code after the first step.
function twoStep(err) {
  if (err.code !== "auth/multi-factor-auth-required") { msg(err.message); return; }
  const res = getMultiFactorResolver(auth, err), hint = res.hints.find(h => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  if (!hint) { msg("This account uses a second step this app does not support. Write to the contact address."); return; }
  $("gate-out").hidden = true; $("g-tfa").hidden = false; $("g-tfa-code").focus(); msg("");
  $("g-tfa").onsubmit = e => {
    e.preventDefault(); const code = $("g-tfa-code").value.replace(/\D/g, "");
    res.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code))
      .then(() => { $("g-tfa").hidden = true; $("g-tfa-code").value = ""; })
      .catch(x => msg(x.code === "auth/invalid-verification-code" ? "That code did not match. Wait for the next code and try again." : x.message));
  };
}

if (isSignInWithEmailLink(auth, location.href)) {
  let email = localStorage.getItem("signin-email") || prompt("Confirm your email address");
  signInWithEmailLink(auth, email, location.href).then(() => history.replaceState(null, "", location.pathname)).catch(twoStep);
}
$("g-google").onclick = () => signInWithPopup(auth, new GoogleAuthProvider()).catch(twoStep);
$("g-email").onsubmit = e => {
  e.preventDefault(); const email = $("g-addr").value.trim();
  sendSignInLinkToEmail(auth, email, { url: location.origin + location.pathname, handleCodeInApp: true })
    .then(() => { try { localStorage.setItem("signin-email", email) } catch (_) {} msg("Check your email for the sign-in link."); })
    .catch(e => msg(e.message));
};
$("g-pw").onsubmit = e => {
  e.preventDefault();
  signInWithEmailAndPassword(auth, $("g-pw-addr").value.trim(), $("g-pw-pass").value)
    .catch(e => e.code === "auth/multi-factor-auth-required" ? twoStep(e) : msg("That email and password do not match an account. Try Google or an email link, or set a password on the My account page."));
};
// New account: username, email and password, then a confirmation link to the email. Payment opens only once the email
// is confirmed (the database rules check it too). Nothing else is collected.
$("g-new").onsubmit = async e => {
  e.preventDefault();
  const name = $("g-new-user").value.trim(), email = $("g-new-addr").value.trim(), pw = $("g-new-pass").value;
  if (pw !== $("g-new-pass2").value) { msg("The two passwords do not match."); return; }
  msg("Creating your account…");
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, pw);
    await updateProfile(user, { displayName: name });
    await sendEmailVerification(user, { url: location.origin + location.pathname });
    verifyScreen(user);
  } catch (x) {
    msg(x.code === "auth/email-already-in-use" ? "That email already has an account. Sign in with your password, Google or an email link."
      : x.code === "auth/weak-password" ? "Choose a longer password (15 characters or more)." : x.message);
  }
};
function verifyScreen(user) {
  $("gate-out").hidden = true; $("gate-sub").hidden = true; $("g-verify").hidden = false; $("g-member").hidden = true;
  $("g-v-addr").textContent = user.email; msg("");
}
$("g-v-done").onclick = async () => {
  const u = auth.currentUser; if (!u) return;
  await u.reload();
  if (!u.emailVerified) { msg("Not confirmed yet. Open the link in the email we sent (check spam), then press the button again."); return; }
  await u.getIdToken(true); $("g-verify").hidden = true; route(u);
};
$("g-v-again").onclick = () => { const u = auth.currentUser; if (u) sendEmailVerification(u, { url: location.origin + location.pathname }).then(() => msg("Sent again. Check your inbox and spam folder.")).catch(x => msg(x.message)); };
$("g-v-out").onclick = () => signOut(auth);

// Offline copy (the Android app should work with no signal): after each download the data set is kept on this device in
// IndexedDB for the signed-in member only. It is used when the network or the membership check cannot be reached, replaced
// on the next download, and deleted at sign-out or when the account is no longer a member.
const idb = () => new Promise((res, rej) => { const q = indexedDB.open("civic-atlas", 1); q.onupgradeneeded = () => q.result.createObjectStore("data"); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
async function keep(uid, text) { try { const d = await idb(); d.transaction("data", "readwrite").objectStore("data").put({ uid, text, at: Date.now() }, "set"); } catch (_) {} }
async function kept(uid) { try { const d = await idb(); return await new Promise(res => { const q = d.transaction("data").objectStore("data").get("set"); q.onsuccess = () => res(q.result && q.result.uid === uid ? q.result : null); q.onerror = () => res(null); }); } catch (_) { return null; } }
async function forget() { try { const d = await idb(); d.transaction("data", "readwrite").objectStore("data").delete("set"); } catch (_) {} }
const out = () => forget().then(() => signOut(auth)); $("g-out").onclick = out; $("signout").onclick = out;

// Install: on Chrome, Edge and Android the app installs to the device like a downloaded program, opens in its own window
// and works offline after the first sign-in. Safari users add it to the Home Screen.
let INSTALL = null;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); INSTALL = e; if (!ANDROID_APP) $("g-install").hidden = false; });
$("g-install").onclick = async () => { if (!INSTALL) return; INSTALL.prompt(); await INSTALL.userChoice; INSTALL = null; $("g-install").hidden = true; };
if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !navigator.standalone && !ANDROID_APP) $("g-ios").hidden = false;

let PRICE = null;
// Membership card on the sign-in screen: the price comes from Stripe. The Android app shows no price (Google Play rules).
if (ANDROID_APP) $("g-member").hidden = true;
else memberPrice().then(p => { PRICE = p; if (p && priceText(p)) $("g-price").textContent = priceText(p); }).catch(() => {});
$("g-buy").onclick = async () => {
  PRICE = PRICE || await memberPrice();
  if (!PRICE) { msg("Memberships are not on sale yet. Please try again soon."); return; }
  msg("Opening checkout…");
  const s = await addDoc(collection(db, "customers", auth.currentUser.uid, "checkout_sessions"),
    { price: PRICE.id, mode: "payment", automatic_tax: true, success_url: location.href, cancel_url: location.href });
  onSnapshot(s, snap => { const { url, error } = snap.data() || {}; if (error) msg(error.message); if (url) location.assign(url); });
};

let started = false;
onAuthStateChanged(auth, user => route(user));
async function route(user) {
  $("gate-out").hidden = !!user; $("gate-sub").hidden = true; $("g-verify").hidden = true; $("g-member").hidden = !!user || ANDROID_APP;
  if (!user) { $("gate").hidden = false; $("app").hidden = true; return; }
  let r;
  try { r = await role(user); }
  catch (_) { const c = await kept(user.uid); if (c) { startWith(c, true); signedInBadge(user, { offline: true }); return; } msg("No connection. Connect once to sign in and save the records on this device."); return; }
  if (!r.member) { forget();
    if (!user.emailVerified) { verifyScreen(user); return; }
    $("g-who").textContent = user.displayName ? `${user.displayName} (${user.email})` : user.email; $("gate-sub").hidden = false;
    if (ANDROID_APP) { $("g-buy").hidden = true; $("g-note").textContent = "This account does not have a membership."; }
    else { PRICE = await memberPrice(); if (PRICE && priceText(PRICE)) $("g-buy").textContent = `Pay by card · ${priceText(PRICE)}`; else $("g-buy").hidden = true;
      zelleBox($("g-zelle"), user, msg); }
    if (ANDROID_APP) $("g-steps").hidden = true;
    return;
  }
  try { window.LB_MEMBER_NO = await memberNumber(user); } catch (_) {}
  msg("Loading the records…");
  try { const text = await loadData(); keep(user.uid, text); startWith({ text }, false); signedInBadge(user, { no: window.LB_MEMBER_NO, editor: r.editor }); }
  catch (_) { const c = await kept(user.uid); if (c) { startWith(c, true); signedInBadge(user, { offline: true, no: window.LB_MEMBER_NO }); }
    else if (r.boss) { msg(""); $("g-msg").innerHTML = 'No records are loaded yet. Open <a href="account.html">My account</a> and use Owner tools > Load records.'; }
    else msg("The records are being updated. Please try again in a few minutes."); }
}
// The data set: from the database in parts (free Spark plan), or from Cloud Storage (Blaze plan) if the parts are not there.
async function loadData() {
  try { const s = await getDocs(query(collection(db, "data"), orderBy("i")));
    if (!s.empty) { const parts = s.docs.map(d => d.data()); if (parts.length === parts[0].n) return parts.map(p => p.t).join(""); } } catch (_) {}
  if (!storage.app.options.storageBucket) throw new Error("no records");   // free plan: no Cloud Storage
  return await Promise.race([getBlob(ref(storage, "data/data.json")).then(b => b.text()), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 20000))]);
}
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
