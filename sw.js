// Offline support: always try the network first (so updates show up right away),
// fall back to the saved copy when the restaurant Wi-Fi is down.
const CACHE = 'kitchen-log-v5';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  // 'reload' skips the browser's HTTP cache so the offline copy is the current version
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const nav = req.mode === 'navigate';
  // opening the app always asks the server (a cheap "not modified" when nothing changed), so a pushed
  // update shows on the next open even in the home-screen app, which has no reload button
  const network = (nav ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req))
    .then(res => {
      // a redirected response can't answer a page navigation; hand back a plain copy
      if (nav && res.redirected) res = new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    });
  const saved = () => caches.match(req).then(r => r || (nav ? caches.match('./').then(x => x || caches.match('./index.html')) : undefined));
  if (!nav) {
    e.respondWith(network.catch(() => saved().then(r => r || Response.error())));
    return;
  }
  // kitchen Wi-Fi can be "connected" with no internet: after 3.5 s open the saved copy instead of a blank
  // screen (the download keeps going and updates the saved copy for next time); an error page from the
  // server also falls back to the saved copy
  e.waitUntil(network.catch(() => {}));
  e.respondWith(new Promise(resolve => {
    let done = false;
    const use = r => { if (r && !done) { done = true; resolve(r); } };
    const timer = setTimeout(() => saved().then(use), 3500);
    network
      .then(res => { if (res.ok) { clearTimeout(timer); use(res); } else saved().then(r => use(r || res)); })
      .catch(() => { clearTimeout(timer); saved().then(r => use(r || Response.error())); });
  }));
});
