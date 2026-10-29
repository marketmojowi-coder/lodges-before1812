// Firebase setup shared by every page. Firebase Hosting serves the project's own config at /__/firebase/init.json,
// so no keys live in this code.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
// On Firebase Hosting the project's settings come from /__/firebase/init.json; on any other host (GitHub Pages) from
// firebase-config.js. These settings are public by design; the database rules are what protect the data.
let cfg; try { cfg = (await import("./firebase-config.js")).default; } catch (_) { cfg = await (await fetch("/__/firebase/init.json")).json(); }
export const OWNER = "marketmojowi@gmail.com";
export const app = initializeApp(cfg);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
// The membership price comes from Stripe itself: the Stripe extension copies every active product and price into
// Firestore (products/{id}/prices/{id}). The product whose metadata says firebaseRole = "member" is the membership,
// so a price changed in the Stripe dashboard reaches the app with no code change. MEMBER_PRICE is only a fallback.
export const MEMBER_PRICE = "price_REPLACE_ME";
export async function memberPrice() {
  try {
    const prods = await getDocs(query(collection(db, "products"), where("active", "==", true), where("role", "==", "member")));
    for (const p of prods.docs) {
      const prices = await getDocs(query(collection(db, "products", p.id, "prices"), where("active", "==", true)));
      const pr = prices.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.unit_amount || 0) - (b.unit_amount || 0))[0];
      if (pr) return { id: pr.id, product: p.data().name || "Membership", amount: pr.unit_amount, currency: pr.currency, interval: pr.interval || pr.recurring?.interval || "", once: pr.type !== "recurring" };
    }
  } catch (_) {}
  return MEMBER_PRICE.startsWith("price_") && !MEMBER_PRICE.includes("REPLACE") ? { id: MEMBER_PRICE, product: "Membership" } : null;
}
export const priceText = p => !p || p.amount == null ? "" :
  (p.amount / 100).toLocaleString(undefined, { style: "currency", currency: (p.currency || "usd").toUpperCase() }) + (p.interval ? ` a ${p.interval}` : ", paid once");

// Member number: a random number made by the browser's cryptographic generator (100 bits), written once.
// The database rules let only the member and the editors read it; nobody can change it afterwards.
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";   // Crockford base 32: no I, L, O or U
export function newMemberNumber() {
  const b = crypto.getRandomValues(new Uint8Array(20));
  const c = [...b].map(x => B32[x & 31]).join("");
  return "CA-" + c.match(/.{5}/g).join("-");
}
export async function memberNumber(user) {
  const ref_ = doc(db, "members", user.uid);
  const snap = await getDoc(ref_);
  if (snap.exists()) return snap.data().no;
  const no = newMemberNumber();
  await setDoc(ref_, { no, created: serverTimestamp() });
  return no;
}
// A strong password, made the same way, for members who want to sign in with email and password.
export function newPassword() {
  const b = crypto.getRandomValues(new Uint8Array(20));
  return [...b].map(x => B32[x & 31]).join("").match(/.{5}/g).join("-");
}
// A member is anyone who has paid the one-time membership (claim member, set by functions/index.js once Stripe reports
// the payment), an older subscriber (stripeRole), or an editor.
export async function role(user) {
  const t = await user.getIdTokenResult(true);
  let paid = false; // a payment confirmed by an editor (paid/{uid}); used on the free Spark plan
  if (!(user.email === OWNER && user.emailVerified) && !(t.claims.member === true || t.claims.stripeRole === "member" || t.claims.editor === true)) {
    try { paid = (await getDoc(doc(db, "paid", user.uid))).exists(); } catch (_) {}
  }
  const boss = user.email === OWNER && user.emailVerified;
  return { member: boss || paid || t.claims.member === true || t.claims.stripeRole === "member" || t.claims.editor === true, editor: boss || t.claims.editor === true, boss, sub: t.claims.stripeRole === "member" && t.claims.member !== true };
}
// The green "signed in" badge in the top bar of every member page.
export function signedInBadge(user, opts = {}) {
  const bar = document.querySelector(".topnav .wrap"); if (!bar || !user) return;
  let b = document.getElementById("member-badge");
  if (!b) { b = document.createElement("span"); b.id = "member-badge"; b.className = "mbadge"; b.setAttribute("role", "status"); bar.append(b); }
  const who = opts.no || user.email || "member";
  b.innerHTML = `<i class="mdot" aria-hidden="true"></i><span>${opts.offline ? "Signed in · offline copy" : opts.editor ? "Signed in · editor" : "Signed in"}</span>`;
  b.title = `Signed in as ${who}`;
}
