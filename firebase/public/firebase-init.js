// Firebase setup shared by every page. Firebase Hosting serves the project's own config at /__/firebase/init.json,
// so no keys live in this code.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
const cfg = await (await fetch("/__/firebase/init.json")).json();
export const app = initializeApp(cfg);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
// Price id of the membership plan in Stripe (set after creating the product; see SETUP.md).
export const MEMBER_PRICE = "price_REPLACE_ME";
// A member is anyone with an active Stripe subscription (claim set by the Stripe extension) or an editor.
export async function role(user) {
  const t = await user.getIdTokenResult(true);
  return { member: t.claims.stripeRole === "member" || t.claims.editor === true, editor: t.claims.editor === true };
}
