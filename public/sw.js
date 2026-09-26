// Minimal offline support for DadaFX (production only).
// App shell is cached; live data still needs internet.
// IMPORTANT: only same-origin GETs are cached. All API traffic
// (Supabase, TradingView, fonts) and all writes pass straight through,
// otherwise cloud sync fails with "TypeError: Failed to fetch".
const CACHE = 'dadafx-v2';
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest'])).catch(() => {})
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // never touch Supabase writes / auth
  let sameOrigin = true;
  try { sameOrigin = new URL(req.url).origin === self.location.origin; } catch { sameOrigin = false; }
  if (!sameOrigin) return; // Supabase, TradingView, fonts go direct
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
