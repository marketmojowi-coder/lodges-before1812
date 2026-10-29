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
const out = () => signOut(auth); $("g-out").onclick = out; $("signout").onclick = out;

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
  const r = await role(user);
  if (!r.member) {
    $("g-who").textContent = user.email || user.displayName; $("gate-sub").hidden = false;
    if (ANDROID_APP) { $("g-buy").hidden = true; $("g-note").textContent = "This account does not have a membership."; }
    else { PRICE = await memberPrice(); if (PRICE && priceText(PRICE)) $("g-buy").textContent = `Become a member · ${priceText(PRICE)}`; }
    return;
  }
  try { window.LB_MEMBER_NO = await memberNumber(user); } catch (_) {}
  msg("Loading the records…");
  const blob = await getBlob(ref(storage, "data/data.json"));
  const DATA = JSON.parse(await blob.text());
  $("gate").hidden = true; $("app").hidden = false; msg("");
  if (!started) { started = true; window.startApp(DATA); }
});

// "Suggest a correction" in the Atlas job site: goes to the corrections bin as a pending fact for the editor.
window.LB_SUGGEST = async (s) => {
  const u = auth.currentUser; if (!u) throw new Error("Sign in first.");
  await addDoc(collection(db, "facts"), { bin: "corrections", man: s.man || "", lodge: s.lodge || "", year: s.year || "", claim: s.claim, citation: s.citation,
    held_at: s.held_at, source: "", volume: "", page: "", status: "pending", by: u.uid, by_name: window.LB_MEMBER_NO || "", agent: false, created: serverTimestamp() });
};
