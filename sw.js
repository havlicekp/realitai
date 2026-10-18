// Offline: aplikace (soubory stránky a písmo) z mezipaměti, na pozadí se obnoví. Data nabídek jsou v IndexedDB,
// požadavky na Google (přihlášení, Drive API) jdou vždy do sítě.
const V = 'rai-1.0.0';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'md.js', 'config.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  const own = u.origin === location.origin, font = /^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);
  if (!own && !font) return;
  // stránka (i po návratu z přihlášení s #access_token) = index.html
  const key = own && r.mode === 'navigate' ? new Request(new URL('index.html', location.href).href) : r;
  e.respondWith(caches.open(V).then(async c => {
    const hit = await c.match(key, { ignoreSearch: own });
    const net = fetch(r).then(res => { if (res.ok || res.type === 'opaque') c.put(key, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || new Response('Offline', { status: 503 });
  }));
});
