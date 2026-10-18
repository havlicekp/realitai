// Offline support: app files and fonts are cached and served from the cache without a connection. Offer data lives in
// IndexedDB; requests to Google (sign-in, Drive API) always go to the network.
const V = 'rai-1.2.1';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'md.js', 'config.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  const own = u.origin === location.origin, font = /^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);
  if (!own && !font) return;
  // the page (also after returning from sign-in with #access_token) = index.html
  const key = own && r.mode === 'navigate' ? new Request(new URL('index.html', location.href).href) : r;
  // own files: network first (a new version on GitHub applies at once), cache after 3 s or offline; fonts cache first
  e.respondWith(caches.open(V).then(async c => {
    const net = fetch(r, own ? { cache: 'no-cache' } : {}).then(res => { if (res.ok || res.type === 'opaque') c.put(key, res.clone()); return res; }).catch(() => null);
    const hit = () => c.match(key, { ignoreSearch: own });
    if (!own) { const h = await hit(); if (h) { e.waitUntil(net); return h; } return (await net) || new Response('', { status: 503 }); }
    const res = await Promise.race([net, new Promise(ok => setTimeout(() => ok('slow'), 3000))]);
    if (res && res !== 'slow') return res;
    const h = await hit();
    if (h) { e.waitUntil(net); return h; }
    return (await net) || new Response('Offline', { status: 503 });
  }));
});
