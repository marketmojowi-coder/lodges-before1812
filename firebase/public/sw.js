// Offline start: keeps the app shell and the legal pages so the app opens without a connection. The data set is fetched after
// sign-in and kept on the device by auth.js (IndexedDB) for offline reading.
const SHELL = "shell-v5";
const FILES = ["/", "/index.html", "/bins.html", "/account.html", "/privacy.html", "/terms.html", "/disclaimer.html", "/copyright.html", "/contact.html", "/sources.html", "/legal.css", "/market-mojo-64.png", "/market-mojo-128.png", "/delete-account.html", "/styles.css", "/app.js",
               "/auth.js", "/bins.js", "/zelle.js", "/vendor/qrcode.js", "/icons/emblem.svg", "/firebase-init.js", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/offline.html"];
self.addEventListener("install", e => e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== SHELL).map(n => caches.delete(n)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/__/")) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(SHELL).then(s => s.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request).then(r => r || (e.request.mode === "navigate" ? caches.match("/offline.html") : undefined))));
});
