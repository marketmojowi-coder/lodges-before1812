// One-time membership: when the Stripe extension records a succeeded payment for the membership product,
// mark the account as a member for life (custom claim member = true). The data set and the bins open on that claim.
// Card details never reach this code; Stripe holds them. A refund is undone with admin/set_member.py --remove.
const { onDocumentWritten, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
// One row per sale, so each membership is accounted for like a product sold (sku, price, sales tax, state, method).
const SKU = "CA-MEMBER-1", PRODUCT = "Civic Atlas membership (one-time)";
async function recordSale(id, row) { await getFirestore().doc(`sales/${id}`).set({ sku: SKU, product: PRODUCT, ...row, recorded: FieldValue.serverTimestamp() }, { merge: true }); }
initializeApp();

// Is this payment for the membership product (metadata firebaseRole = member, copied by the extension as role)?
async function forMembership(pay) {
  const db = getFirestore();
  const products = new Set();
  for (const it of pay.items || []) { const p = it.price && it.price.product; if (p) products.add(typeof p === "string" ? p : p.id); }
  for (const ref of pay.prices || []) { if (ref && ref.parent && ref.parent.parent) products.add(ref.parent.parent.id); }
  for (const id of products) { const s = await db.doc(`products/${id}`).get(); if (s.exists && s.get("role") === "member") return true; }
  return false;
}

exports.grantMembership = onDocumentWritten({ document: "customers/{uid}/payments/{pid}", region: "us-central1" }, async (ev) => {
  const after = ev.data && ev.data.after && ev.data.after.exists ? ev.data.after.data() : null;
  if (!after || after.status !== "succeeded") return;
  if (!(await forMembership(after))) return;
  const { uid, pid } = ev.params;
  const user = await getAuth().getUser(uid);
  const claims = { ...(user.customClaims || {}) };
  if (claims.member === true) return;
  claims.member = true;
  await getAuth().setCustomUserClaims(uid, claims);
  const tax = (after.total_details && after.total_details.amount_tax) || 0;
  await recordSale(`stripe_${pid}`, { method: "Stripe (card)", uid, email: user.email || "", price: (after.amount || 0) - tax, tax, total: after.amount || 0,
    currency: after.currency || "usd", state: (after.shipping && after.shipping.address && after.shipping.address.state) || "", ref: pid, paid_on: after.created || null });
  console.log("membership granted", uid, pid);
});

// Zelle, confirmed by hand: when an editor marks a buyer's claim as paid (only editors may, by the database rules),
// switch the membership on. The member's app sees it at once and shows the green badge.
exports.confirmZelle = onDocumentUpdated({ document: "zelle_claims/{uid}", region: "us-central1" }, async (ev) => {
  const before = ev.data.before.data() || {}, after = ev.data.after.data() || {};
  if (after.status !== "paid" || before.status === "paid") return;
  const { uid } = ev.params;
  const user = await getAuth().getUser(uid);
  const claims = { ...(user.customClaims || {}) };
  await recordSale(`zelle_${uid}`, { method: "Zelle", uid, email: after.email || user.email || "", name: after.name || "", state: after.state || "",
    price: after.price || 999, tax: after.tax || 0, total: after.total || after.price || 999, currency: "usd", ref: after.ref || "", paid_on: Math.floor(Date.now() / 1000) });
  if (claims.member === true) return;
  claims.member = true;
  await getAuth().setCustomUserClaims(uid, claims);
  console.log("membership granted by Zelle", uid);
});
