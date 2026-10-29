// Offline start: keeps the app shell so it opens without a connection. The data set itself is fetched after sign-in.
const SHELL = "shell-v1";
const FILES = ["/", "/index.html", "/bins.html", "/privacy.html", "/terms.html", "/delete-account.html", "/styles.css", "/app.js",
               "/auth.js", "/bins.js", "/firebase-init.js", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/offline.html"];
self.addEventListener("install", e => e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== SHELL).map(n => caches.delete(n)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/__/")) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(SHELL).then(s => s.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request).then(r => r || (e.request.mode === "navigate" ? caches.match("/offline.html") : undefined))));
});
