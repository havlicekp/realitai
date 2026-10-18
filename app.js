// RealitAI mobile companion: reads the archive from Google Drive (hidden app data folder), works offline and sends
// edits back. The RealitAI browser extension uploads index.json, n-ID.json and t-ID.jpg; the phone stores them in
// IndexedDB and downloads only files whose fingerprint (appProperties.h) changed. Google sign-in = implicit flow with
// redirect, scope drive.appdata (the app cannot see anything else in Drive). No server.
'use strict';
const APP_V = '1.2.1';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const $app = document.getElementById('app');

// ---------- storage ----------
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem('rai-' + k)); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem('rai-' + k, JSON.stringify(v)); } catch (_) {} },
  del(k) { try { localStorage.removeItem('rai-' + k); } catch (_) {} }
};
const clientId = () => LS.get('clientId') || (window.RAI_CONFIG || {}).clientId || '';
const apiBase = () => LS.get('base') || 'https://www.googleapis.com'; // different address only for tests
const DB = (() => {
  let opening;
  const open = () => opening || (opening = new Promise((res, rej) => {
    const r = indexedDB.open('rai', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('docs'); d.createObjectStore('thumbs'); d.createObjectStore('meta'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = async (st, mode, fn) => { const d = await open(), t = d.transaction(st, mode), out = fn(t.objectStore(st)); await new Promise((res, rej) => { t.oncomplete = res; t.onerror = t.onabort = () => rej(t.error || new Error('Zápis do úložiště telefonu se nepodařil')); }); return out; };
  return {
    get: async (st, k) => req((await open()).transaction(st).objectStore(st).get(k)),
    put: (st, k, v) => tx(st, 'readwrite', s => s.put(v, k)),
    del: (st, k) => tx(st, 'readwrite', s => s.delete(k)),
    keys: async st => req((await open()).transaction(st).objectStore(st).getAllKeys()),
    clear: async () => { for (const st of ['docs', 'thumbs', 'meta']) await tx(st, 'readwrite', s => s.clear()); }
  };
})();

// ---------- formatting ----------
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kc = v => v ? Math.round(v).toLocaleString('cs-CZ') + ' Kč' : 'cena neuvedena';
const mil = v => (v / 1e6).toLocaleString('cs-CZ', { maximumFractionDigits: 1 }) + ' mil.';
const sc = v => v == null ? '–' : Number(v).toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dat = s => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? String(s) : d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' }); };
const ago = t => { const m = Math.round((Date.now() - t) / 60e3); return m < 1 ? 'právě teď' : m < 60 ? `před ${m} min` : m < 1440 ? `před ${Math.round(m / 60)} h` : `před ${Math.round(m / 1440)} d`; };
const DNY = ['NE', 'PO', 'ÚT', 'ST', 'ČT', 'PÁ', 'SO'];
const today = () => new Date().toISOString().slice(0, 10);
const scoreCls = (v, ko) => ko ? 'bad' : v == null ? '' : v >= 4 ? 'ok' : v >= 3 ? 'warn' : 'bad';
const scoreCol = (v, ko) => ({ ok: '#3E8A52', warn: '#D19A2E', bad: '#C2493E' }[scoreCls(v, ko)] || '#B9B0A5');
const qCls = v => v < 30 ? 'q1' : v < 50 ? 'q2' : v < 70 ? 'q3' : v < 85 ? 'q4' : 'q5';
const dbCol = v => v < 40 ? '#A9CF95' : v < 50 ? '#D9C46A' : v < 55 ? '#E9A86A' : '#E08A7E';
const titleOf = it => [it.dispozice, it.plocha ? it.plocha + ' m²' : ''].filter(Boolean).join(' · ') || it.nazev || 'Nabídka';
const placeOf = it => [it.ulice, it.cast || it.mesto].filter(Boolean).join(', ');
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const STAVY = { zajimavy: 'Zajímavý', prohlidka: 'Prohlídka domluvena', 'po-prohlidce': 'Po prohlídce', nabidka: 'Podána nabídka', rezervace: 'Rezervace', odmitnuto: 'Odmítnuto', koupeno: 'Koupeno' };
const I = {
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  ext: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>',
  sync: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M3 21v-5h5"/></svg>',
  ok: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  search: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  nav: {
    '': '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    mapa: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14"/><path d="M15 6v14"/>',
    prohlidky: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M3 11h18"/>',
    nastaveni: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'
  }
};

// ---------- Google sign-in ----------
const token = () => { const t = LS.get('token'); return t && t.exp > Date.now() + 60e3 ? t.t : null; };
function login(prompt) {
  const st = Math.random().toString(36).slice(2);
  sessionStorage.setItem('rai-state', st);
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.search = new URLSearchParams(Object.assign({ client_id: clientId(), response_type: 'token', redirect_uri: location.origin + location.pathname, scope: SCOPE, include_granted_scopes: 'true', state: st }, prompt ? { prompt } : {}));
  location.assign(u.href);
}
// Return from sign-in: #access_token=…&expires_in=…&state=… (or #error=… after a silent renewal)
function takeToken() {
  const h = location.hash.slice(1);
  if (!/(^|&)(access_token|error)=/.test(h)) return;
  const p = new URLSearchParams(h), st = sessionStorage.getItem('rai-state');
  if (p.get('access_token') && p.get('state') === st) {
    LS.set('token', { t: p.get('access_token'), exp: Date.now() + (+p.get('expires_in') || 3600) * 1000 });
    LS.set('connected', true);
    sessionStorage.removeItem('rai-silent');
  } else if (p.get('error')) sessionStorage.setItem('rai-loginErr', p.get('error'));
  sessionStorage.removeItem('rai-state');
  history.replaceState(null, '', location.pathname + (sessionStorage.getItem('rai-return') || '#/'));
  sessionStorage.removeItem('rai-return');
}
class NeedLogin extends Error {}
async function api(path, as) {
  const t = token();
  if (!t) throw new NeedLogin('Přihlášení vypršelo');
  // every request: 30 s limit plus cancellation of the whole sync (after iOS resumes the app, stalled requests never finish)
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 30000), stop = () => ctl.abort();
  if (S.ctl) S.ctl.signal.addEventListener('abort', stop);
  let r;
  try { r = await fetch(apiBase() + path, { headers: { Authorization: 'Bearer ' + t }, signal: ctl.signal }); if (r.ok) r = { ok: true, status: r.status, data: as === 'blob' ? await r.blob() : await r.json() }; }
  finally { clearTimeout(tm); if (S.ctl) S.ctl.signal.removeEventListener('abort', stop); }
  if (r.status === 401) { LS.del('token'); throw new NeedLogin('Přihlášení vypršelo'); }
  if (!r.ok) throw new Error(`Google Drive ${r.status}`);
  return r.data;
}
async function listFiles() {
  const out = [];
  let page = '';
  do {
    const q = new URLSearchParams({ spaces: 'appDataFolder', pageSize: '1000', fields: 'nextPageToken,files(id,name,appProperties)' });
    if (page) q.set('pageToken', page);
    const j = await api('/drive/v3/files?' + q);
    out.push(...(j.files || [])); page = j.nextPageToken || '';
  } while (page);
  return out;
}

// ---------- synchronizace ----------
const S = { index: null, at: null, running: false, done: 0, total: 0, error: null, needLogin: false, thumbs: new Map() };
async function loadLocal() {
  const m = await DB.get('meta', 'index');
  if (m) { S.index = m.items; S.at = m.syncedAt; S.serverAt = m.at; }
}
async function syncNow(manual) {
  if (S.running) return;
  if (!navigator.onLine) { S.error = 'offline'; render(); return; }
  if (!token()) {
    // silent sign-in renewal (once per launch), otherwise show the sign-in button
    if (LS.get('connected') && clientId() && !sessionStorage.getItem('rai-silent')) { sessionStorage.setItem('rai-silent', '1'); sessionStorage.setItem('rai-return', location.hash || '#/'); login('none'); return; }
    S.needLogin = true; render(); return;
  }
  S.running = true; S.error = null; S.needLogin = false; S.done = 0; S.total = 0; S.last = Date.now(); S.ctl = new AbortController(); render();
  await flush();
  // keep the screen awake while downloading (iOS 16.4+, Android); iOS suspends the page in the background –
  // downloads are saved as they arrive and the next sync resumes
  try { S.wake = navigator.wakeLock ? await navigator.wakeLock.request('screen') : null; } catch (_) { S.wake = null; }
  try {
    const files = await listFiles(), byName = new Map(files.map(f => [f.name, f]));
    const fi = byName.get('index.json');
    if (!fi) { S.error = 'empty'; return; }
    const meta = (await DB.get('meta', 'index')) || {}, ih = (fi.appProperties || {}).h;
    const idx = meta.h === ih && meta.items ? meta : await api(`/drive/v3/files/${fi.id}?alt=media`);
    // store the list right away – offers are visible even if the detail download is interrupted
    if (meta.h !== ih) { await DB.put('meta', 'index', { h: ih, at: idx.at, items: idx.items, syncedAt: meta.syncedAt || null }); S.index = idx.items; S.serverAt = idx.at; }
    const hs = (await DB.get('meta', 'hs')) || {}, ts = (await DB.get('meta', 'ts')) || {};
    const jobs = [];
    for (const it of idx.items) {
      if (hs[it.id] !== it.h && byName.get(`n-${it.id}.json`)) jobs.push({ k: 'n', it });
      if (it.t && ts[it.id] !== it.t && byName.get(`t-${it.id}.jpg`)) jobs.push({ k: 't', it });
    }
    S.total = jobs.length; render();
    let lastDraw = 0;
    await Promise.all([0, 1, 2, 3, 4, 5].map(async () => {
      for (let j; (j = jobs.shift());) {
        if (j.k === 'n') { await DB.put('docs', j.it.id, await api(`/drive/v3/files/${byName.get(`n-${j.it.id}.json`).id}?alt=media`)); hs[j.it.id] = j.it.h; }
        else { // thumbnail as ArrayBuffer – WebKit (Safari) cannot store Blobs in IndexedDB in some modes
          const b = await api(`/drive/v3/files/${byName.get(`t-${j.it.id}.jpg`).id}?alt=media`, 'blob');
          await DB.put('thumbs', j.it.id, { type: b.type || 'image/jpeg', buf: await b.arrayBuffer() }); ts[j.it.id] = j.it.t; S.thumbs.delete(j.it.id); }
        S.done++; S.last = Date.now();
        if (Date.now() - lastDraw > 400) { lastDraw = Date.now(); await DB.put('meta', 'hs', hs); await DB.put('meta', 'ts', ts); drawSync(); }
      }
    }));
    // offers removed from the archive
    const live = new Set(idx.items.map(x => x.id));
    for (const k of await DB.keys('docs')) if (!live.has(k)) { await DB.del('docs', k); delete hs[k]; }
    for (const k of await DB.keys('thumbs')) if (!live.has(k)) { await DB.del('thumbs', k); delete ts[k]; }
    await DB.put('meta', 'hs', hs); await DB.put('meta', 'ts', ts);
    S.at = Date.now();
    await DB.put('meta', 'index', { h: ih, at: idx.at, items: idx.items, syncedAt: S.at });
    S.index = idx.items; S.serverAt = idx.at;
    // stop overlaying phone edits that the extension has already applied
    if (idx.applied && OB.sent.length) { const ap = new Set(idx.applied); OB.sent = OB.sent.filter(x => !ap.has(x.file)); await saveOutbox(); }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch (e) {
    if (S.ctl && S.ctl.signal.aborted) { S.restart = true; return; } // interrupted after returning from background – resume
    if (e instanceof NeedLogin) { S.needLogin = true; if (manual && clientId()) { sessionStorage.setItem('rai-return', location.hash || '#/'); login(); return; } }
    else S.error = navigator.onLine ? (e && e.message) || String(e) : 'offline';
  } finally {
    S.running = false; S.ctl = null;
    if (S.wake) { S.wake.release().catch(() => {}); S.wake = null; }
    refresh();
    if (S.restart) { S.restart = false; setTimeout(() => syncNow(), 300); }
  }
}
// After sync: while the user types in search, redraw only the list (keep the keyboard open)
function refresh() {
  const lbEl = document.querySelector('[data-lb]');
  if (lbEl && document.activeElement && document.activeElement.dataset.a === 'q') { lbEl.innerHTML = listBody(); wireThumbs(lbEl); drawSync(); return; }
  render();
}
// Sync status pill in the header (redraws only the pill, not the whole list)
function syncPill() {
  if (S.running) return `<span class="pill run"><span>${S.at ? 'Synchronizuji' : 'Stahuji'}${S.total ? ` ${S.done} z ${S.total}` : '…'}</span></span>`;
  if (S.needLogin) return `<span class="pill err"><span>Přihlášení vypršelo</span></span>`;
  if (S.error === 'offline') return `<span class="pill off"><span>Offline${S.at ? ' · data ' + ago(S.at) : ''}</span></span>`;
  if (S.error === 'empty') return `<span class="pill off"><span>V Drive zatím nejsou data</span></span>`;
  if (S.error) return `<span class="pill err"><span>Chyba synchronizace</span></span>`;
  return S.at ? `<span class="pill">${I.ok}<span>Synchronizováno ${ago(S.at)}</span></span>` : '';
}
function drawSync() { const p = document.querySelector('[data-pill]'); if (p) p.innerHTML = syncPill(); if (!S.running) ptrHide(); }
// Synchronizace tažením dolů (pull to refresh) na seznamu nabídek a prohlídek: ukazatel sjede shora, po puštění za hranicí
// se spustí synchronizace a ukazatel se točí, dokud neskončí
const $ptr = document.createElement('div');
$ptr.className = 'ptr'; $ptr.setAttribute('aria-hidden', 'true'); $ptr.innerHTML = I.sync;
document.body.appendChild($ptr);
const PTR_MAX = 90, PTR_GO = 64;
let ptrY0 = null, ptrD = 0;
const ptrOn = () => ['list', 'prohlidky'].includes(route().v) && LS.get('connected') && !document.querySelector('.shbg');
function ptrHide() { $ptr.classList.remove('spin', 'ready', 'drag'); $ptr.style.transform = ''; $ptr.style.opacity = ''; }
addEventListener('touchstart', e => { ptrY0 = ptrOn() && window.scrollY <= 0 && !S.running && e.touches.length === 1 ? e.touches[0].clientY : null; ptrD = 0; }, { passive: true });
addEventListener('touchmove', e => {
  if (ptrY0 == null) return;
  const dy = e.touches[0].clientY - ptrY0;
  if (dy <= 0 || window.scrollY > 0) { ptrD = 0; ptrHide(); return; }
  ptrD = Math.min(PTR_MAX, dy * 0.5);
  $ptr.classList.add('drag'); $ptr.classList.toggle('ready', ptrD >= PTR_GO);
  $ptr.style.transform = `translateY(${ptrD}px) rotate(${ptrD * 4}deg)`; $ptr.style.opacity = Math.min(1, ptrD / PTR_GO);
}, { passive: true });
addEventListener('touchend', () => {
  if (ptrY0 == null) return;
  ptrY0 = null; $ptr.classList.remove('drag');
  if (ptrD >= PTR_GO) { $ptr.classList.add('spin'); $ptr.style.transform = `translateY(${PTR_GO}px)`; $ptr.style.opacity = 1; syncNow(true).finally(() => setTimeout(ptrHide, 300)); }
  else ptrHide();
});

// ---------- thumbnails ----------
async function thumbUrl(id) {
  if (S.thumbs.has(id)) return S.thumbs.get(id);
  const b = await DB.get('thumbs', id), u = !b ? '' : URL.createObjectURL(b instanceof Blob ? b : new Blob([b.buf], { type: b.type }));
  S.thumbs.set(id, u);
  return u;
}
const thumbObs = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { thumbObs.unobserve(e.target); fillThumb(e.target); } }), { rootMargin: '300px' }) : null;
async function fillThumb(el) { const u = await thumbUrl(+el.dataset.th); if (u) el.style.backgroundImage = `url("${u}")`; }
function wireThumbs(root) { root.querySelectorAll('[data-th]').forEach(el => thumbObs ? thumbObs.observe(el) : fillThumb(el)); }

// ---------- obrazovky ----------
const ui = Object.assign({ filtr: 'ulozene', q: '', shown: 40 }, LS.get('ui') || {}, { shown: 40 });
const saveUi = () => LS.set('ui', { filtr: ui.filtr });
// Main navigation: a single element outside #app, only shown/hidden and re-highlighted between screens
// (iPhone Safari sometimes failed to paint a freshly inserted floating bar after a re-render)
const $nav = document.createElement('nav');
$nav.className = 'nav'; $nav.setAttribute('aria-label', 'Hlavní navigace'); $nav.hidden = true;
$nav.innerHTML = [['', 'Nabídky'], ['mapa', 'Mapa'], ['prohlidky', 'Prohlídky'], ['nastaveni', 'Nastavení']].map(([k, l]) =>
  `<a href="#/${k}" data-nav="${k}"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I.nav[k]}</svg>${l}</a>`).join('');
document.body.appendChild($nav);
function setNav(cur) {
  $nav.hidden = cur == null;
  $nav.querySelectorAll('a').forEach(a => { const on = a.dataset.nav === cur; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
}
const nav = () => '';
const upcoming = p => p.datum && (p.datum > today() || (p.datum === today() && !p.dojem)); // today's visit with a rating has already happened
const planned = it => (it.prohlidky || []).filter(upcoming).sort((a, b) => a.datum.localeCompare(b.datum))[0] || null;
const FILTRY = [
  ['prohlidka', 'Na prohlídku', it => !!planned(it) || it.stav === 'prohlidka'],
  ['ulozene', 'Uložené', it => it.ulozeno !== false && !it.vlastni],
  ['analyza', 'S analýzou', it => it.skore != null || it.ko],
  ['vlastni', 'Vlastní', it => it.vlastni],
  ['zmizele', 'Zmizelé', it => it.ulozeno === false],
  ['vse', 'Vše', () => true]
];
function card(it) {
  const p = planned(it), tags = [];
  if (it.ko) tags.push('<span class="tag bad">KO</span>');
  else if (it.skore != null) tags.push(`<span class="tag ${scoreCls(it.skore)}">${it.rezim === 'screening' ? 'scr. ' : 'DD '}${sc(it.skore)}</span>`);
  if (p) { const d = new Date(p.datum); tags.push(`<span class="tag date">${DNY[d.getDay()].toLowerCase()} ${d.getDate()}. ${d.getMonth() + 1}.</span>`); }
  if (it.zmenaCeny) tags.push(`<span class="tag ${it.zmenaCeny < 0 ? 'ok' : 'bad'}">${it.zmenaCeny < 0 ? '↓' : '↑'} ${Math.abs(it.zmenaCeny) >= 1e6 ? mil(Math.abs(it.zmenaCeny)) : Math.round(Math.abs(it.zmenaCeny) / 1000).toLocaleString('cs-CZ') + ' tis.'}</span>`);
  if (it.ulozeno === false) tags.push('<span class="tag">už neuloženo</span>');
  if (it.stav && STAVY[it.stav] && it.stav !== 'prohlidka') tags.push(`<span class="tag">${esc(STAVY[it.stav])}</span>`);
  return `<a class="card${it.ulozeno === false ? ' gone' : ''}" href="#/n/${it.id}"><div class="th" data-th="${it.id}"></div><div class="bd">
    <div class="tags">${tags.join('')}</div><div class="t">${esc(titleOf(it))}</div><div class="u">${esc(placeOf(it))}</div><div class="p">${kc(it.cena)}</div></div></a>`;
}
function listBody() {
  const items = idxItems(), f = FILTRY.find(x => x[0] === ui.filtr) || FILTRY[1];
  const q = norm(ui.q).trim().split(/\s+/).filter(Boolean);
  let list = items.filter(f[2]).filter(it => q.every(w => (it.q || '').includes(w) || norm(titleOf(it) + ' ' + placeOf(it)).includes(w)));
  if (f[0] === 'prohlidka') list.sort((a, b) => ((planned(a) || {}).datum || '9').localeCompare((planned(b) || {}).datum || '9'));
  const next = items.map(it => ({ it, p: planned(it) })).filter(x => x.p).sort((a, b) => a.p.datum.localeCompare(b.p.datum))[0];
  const nd = next && new Date(next.p.datum);
  return `${next && !q.length ? `<div class="next"><div class="d"><span>${DNY[nd.getDay()]}</span><b>${nd.getDate()}</b><span>${nd.getMonth() + 1}.</span></div>
      <a class="x" href="#/n/${next.it.id}"><small>Nejbližší prohlídka</small><b>${esc(placeOf(next.it) || titleOf(next.it))}</b><span>${esc(titleOf(next.it))}${next.it.overit ? ` · ${next.it.overit} bodů k ověření` : ''}</span></a></div>` : ''}
    <div class="sec"><h2>${esc(f[1])}</h2><span>${list.length} ${list.length === 1 ? 'nabídka' : list.length < 5 && list.length ? 'nabídky' : 'nabídek'}</span></div>
    <div class="list">${list.slice(0, ui.shown).map(card).join('') || `<div class="empty">${items.length ? 'Nic neodpovídá.' : S.running ? 'Stahuji data…' : 'Zatím žádná data.'}</div>`}</div>
    ${list.length > ui.shown ? `<button class="more" data-a="more">Zobrazit další (${list.length - ui.shown})</button>` : ''}`;
}
function viewList() {
  const items = idxItems(), f = FILTRY.find(x => x[0] === ui.filtr) || FILTRY[1];
  const banner = S.needLogin ? `<div class="banner"><span>Přihlášení ke Google vypršelo – data jsou z ${S.at ? ago(S.at) : 'minula'}.</span><button class="sm" data-a="login">Přihlásit</button></div>`
    : S.error && S.error !== 'offline' && S.error !== 'empty' ? `<div class="banner"><span>${esc(S.error)}</span><button class="sm" data-a="sync-retry">Zkusit znovu</button></div>`
    : S.error === 'offline' ? `<div class="banner off"><span>Offline${S.at ? ' · data ' + ago(S.at) : ''}</span></div>`
    : S.running && !S.at ? `<div class="banner"><span>První stažení trvá asi minutu – nechte aplikaci otevřenou. Když ji zavřete, příště naváže tam, kde skončila.</span></div>`
    : S.error === 'empty' && !items.length ? `<div class="banner"><span>V Google Drive zatím nejsou data. V rozšíření RealitAI otevřete Nastavení → Telefon a klikněte na „Připojit Google Drive“.</span></div>` : '';
  return `<div class="scr">
    ${banner}
    <h1 class="h1">Nabídky</h1>
    <label class="search">${I.search}<input type="search" data-a="q" value="${esc(ui.q)}" placeholder="Hledat ulici, čtvrť, poznámku…" aria-label="Hledat v nabídkách" enterkeyhint="search"></label>
    <div class="chips" role="tablist">${FILTRY.map(([k, l, fn]) => { const n = items.filter(fn).length; return k === 'vlastni' && !n ? '' : `<button class="chip${f[0] === k ? ' on' : ''}" data-f="${k}" role="tab" aria-selected="${f[0] === k}">${l}${k === 'analyza' || k === 'vse' ? '' : ' · ' + n}</button>`; }).join('')}</div>
    <div data-lb>${listBody()}</div>
  </div>${nav('')}`;
}
function wireList(root) {
  const inp = root.querySelector('[data-a=q]');
  // while typing redraw only the list (the phone keyboard stays open)
  const lb = () => { const el = root.querySelector('[data-lb]'); el.innerHTML = listBody(); wireThumbs(el); };
  inp.addEventListener('input', () => { ui.q = inp.value; ui.shown = 40; lb(); });
  root.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { ui.filtr = b.dataset.f; ui.shown = 40; saveUi(); root.querySelectorAll('[data-f]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); lb(); }));
  root.addEventListener('click', e => { if (e.target.closest('[data-a=more]')) { ui.shown += 60; lb(); } });
}

// offer detail
const TABS = [['prehled', 'Přehled'], ['analyza', 'Analýza'], ['poznamky', 'Poznámky']];
const param = (d, re) => { const p = (d.parametry || []).find(([k]) => re.test(k)); return p ? p[1] : null; };
function bars(idx) {
  return `<div class="bars">${idx.map(x => `<div class="bar"><span>${esc(x.nazev.replace(/ \(.*\)$/, ''))}</span><i><b class="${qCls(x.v)}" style="width:${Math.max(2, x.v)}%"></b></i><b>${x.v}</b></div>`).join('')}</div>`;
}
function tabPrehled(d, it) {
  const an = d.analyza, out = [];
  if (an) out.push(`<div class="box"><h3>Verdikt analýzy</h3><div class="big">${esc(an.verdikt || (an.ko.length ? 'KO' : '–'))}</div>${an.ko.length ? `<p class="err">KO: ${esc(an.ko.join('; '))}</p>` : ''}${an.rizika.length ? `<p class="muted">Rizika: ${esc(an.rizika.slice(0, 2).join('; '))}</p>` : ''}</div>`);
  const fl = param(d, /^Podlaží/i), ven = param(d, /Balk|Terasa|Lodžie|Zahrada/i), penb = param(d, /Energetick|PENB/i), ppm = d.cena && d.plocha ? Math.round(d.cena / d.plocha) : null;
  const facts = [fl && ['Podlaží', fl.replace(/podlaží.*$/i, '').replace(/\s+z\s+/, ' z ').trim()], ven && ['Venkovní', ven], penb && ['PENB', (penb.match(/\b[A-G]\b/) || [penb])[0]], ppm && ['Kč/m²', ppm.toLocaleString('cs-CZ')], d.plocha && ['Plocha', d.plocha + ' m²']].filter(Boolean).slice(0, 3);
  if (facts.length) out.push(`<div class="facts">${facts.map(([k, v]) => `<div class="fact"><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>`);
  const L = d.lokalitaData || {};
  if ((L.idx || []).length) out.push(`<div class="box"><h3>Lokalita v číslech <small>0–100, víc = lépe</small></h3>${bars(L.idx)}${d.lokalita.jenUlice ? '<p class="muted">Inzerát uvádí jen ulici – data o lokalitě jsou orientační.</p>' : ''}</div>`);
  if ((L.fakta || []).length) out.push(`<div class="box"><h3>Okolí</h3><div class="items">${L.fakta.map(t => `<div class="it"><b>·</b><span>${esc(t)}</span></div>`).join('')}</div></div>`);
  if (d.popis) out.push(`<details class="box"><summary>Popis od makléře</summary><div class="desc">${esc(d.popis)}</div></details>`);
  if ((d.parametry || []).length) out.push(`<details class="box"><summary>Parametry</summary><dl class="params">${d.parametry.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></details>`);
  if ((d.ceny || []).length > 1) out.push(`<details class="box"><summary>Vývoj ceny</summary><div class="items">${d.ceny.slice().reverse().map(x => `<div class="it"><b></b><span>${dat(x.t)} · <b>${kc(x.p)}</b></span></div>`).join('')}</div></details>`);
  return out.join('') || '<div class="empty">Bez údajů.</div>';
}
function tabAnalyza(d) {
  const an = d.analyza;
  if (!an) return '<div class="empty">Nabídka zatím nemá analýzu. Spustíte ji v rozšíření RealitAI v počítači.</div>';
  const out = [`<div class="box"><h3>Verdikt <small>${esc([an.rezim === 'screening' ? 'Screening' : 'Analýza', dat(an.datum), an.model].filter(Boolean).join(' · '))}</small></h3><div class="big">${esc(an.verdikt || '–')}</div>${an.maxCena ? `<p>Maximální cena: <b>${kc(an.maxCena)}</b></p>` : ''}${an.ko.length ? `<p class="err">KO: ${esc(an.ko.join('; '))}</p>` : ''}</div>`];
  if (an.silne.length) out.push(`<div class="box"><h3 style="color:#3E7A4C">Silné stránky</h3><div class="items">${an.silne.map(t => `<div class="it plus"><b>+</b><span>${esc(t)}</span></div>`).join('')}</div></div>`);
  if (an.rizika.length) out.push(`<div class="box"><h3 style="color:#A0453D">Rizika</h3><div class="items">${an.rizika.map(t => `<div class="it minus"><b>!</b><span>${esc(t)}</span></div>`).join('')}</div></div>`);
  if (an.overit.length) {
    let g = null;
    out.push(`<div class="box"><h3>Ověřit <small>${an.overit.length} bodů</small></h3><div class="items">${an.overit.map(x => { const h = x.grp && x.grp !== g ? `<div class="grp">${esc(g = x.grp)}</div>` : ''; return h + `<div class="it"><span class="chk${x.done ? ' done' : ''}"></span><span>${esc(x.text)}</span></div>`; }).join('')}</div><p class="muted">Odškrtávání na prohlídce přibude v režimu prohlídky.</p></div>`);
  }
  if (an.kategorie.length) out.push(`<details class="box"><summary>Hodnocení podle kategorií</summary><div class="bars">${an.kategorie.map(k => `<div class="bar"><span>${esc(k.nazev)}</span><i><b class="${k.v == null ? '' : k.v < 2 ? 'q1' : k.v < 3 ? 'q2' : k.v < 3.5 ? 'q3' : k.v < 4 ? 'q4' : 'q5'}" style="width:${k.v == null ? 0 : k.v / 5 * 100}%"></b></i><b>${sc(k.v)}</b></div>${k.komentar ? `<div class="why">${esc(k.komentar)}</div>` : ''}`).join('')}</div></details>`);
  if (an.dokumenty.length) out.push(`<details class="box"><summary>Dokumenty k vyžádání</summary><div class="items">${an.dokumenty.map(t => `<div class="it"><b>·</b><span>${esc(t)}</span></div>`).join('')}</div></details>`);
  if (an.md) out.push(`<a class="rowlink" href="#/n/${d.id}/report">Celý report analýzy ›</a>`);
  return out.join('');
}
// Notes from the extension editor: allowed tags only, http(s)/mailto links
function safeHtml(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html'), OK = /^(B|STRONG|I|EM|U|S|STRIKE|H3|H4|UL|OL|LI|P|BR|DIV|A|BLOCKQUOTE|SPAN)$/;
  // allowed attributes: link (http, https, mailto), image placeholder from the extension (data-nimg, data-w – the image stays on the computer)
  const keep = (c, a) => (c.tagName === 'A' && a.name === 'href' && /^(https?:|mailto:)/i.test(a.value)) || (c.tagName === 'SPAN' && (a.name === 'data-nimg' && /^\d+:n\d+$/.test(a.value) || a.name === 'data-w' && /^\d+$/.test(a.value)));
  const walk = n => { for (const c of [...n.childNodes]) { if (c.nodeType === 1) { if (!OK.test(c.tagName)) { c.replaceWith(...c.childNodes); continue; } for (const a of [...c.attributes]) if (!keep(c, a)) c.removeAttribute(a.name); if (c.tagName === 'A') { c.target = '_blank'; c.rel = 'noopener'; } walk(c); } else if (c.nodeType !== 3) c.remove(); } };
  walk(doc.body.firstChild);
  return doc.body.firstChild.innerHTML;
}
const fmtT = t => t ? new Date(t).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
function tabPoznamky(d) {
  const out = [], P = d.poznamky;
  // notes are edited in place (toolbar above, automatic lists and links as in the extension)
  out.push(`<div class="box nbox"><h3>Poznámky</h3>
    <div class="ntb" role="toolbar" aria-label="Formátování">${TB.map(t => t === '|' ? '<span class="sep"></span>' : `<button type="button" data-cmd="${t[0]}" aria-label="${t[2]}" title="${t[2]}">${t[1]}</button>`).join('')}</div>
    <div class="ned notes" contenteditable="true" data-ned spellcheck="true" aria-label="Poznámky" data-ph="Pište poznámky… (– a mezera = odrážky, 1. a mezera = číslování)">${P ? (P.html ? safeHtml(P.html) : esc(P.text).replace(/\n/g, '<br>')) : ''}</div></div>`);
  if ((d.prilohy || []).length) out.push(`<div class="box"><h3>Přílohy</h3><div class="items">${d.prilohy.map(a => `<div class="it"><b>·</b><span>${esc(a.name)} <span class="muted">${a.size ? Math.round(a.size / 1024).toLocaleString('cs-CZ') + ' kB' : ''}</span></span></div>`).join('')}</div><p class="muted">Soubory příloh jsou zatím jen v rozšíření v počítači.</p></div>`);
  return out.join('');
}
async function viewDetail(id, tab) {
  const d = await getDoc(id), it = (S.index || []).find(x => x.id === id);
  if (!d) return `<div class="scr"><div class="top"><button class="ibtn" data-a="back" aria-label="Zpět">${I.back}</button></div><div class="empty">${S.running ? 'Nabídka se ještě stahuje…' : 'Nabídka není v telefonu.'}</div></div>`;
  tab = TABS.some(t => t[0] === tab) ? tab : 'prehled';
  const an = d.analyza, ko = an && an.ko.length > 0, v = an && an.skore;
  const ring = an ? `<div class="ring" style="background:conic-gradient(${scoreCol(v, ko)} 0 ${ko ? 100 : (v || 0) / 5 * 100}%, #E4DED7 0 100%)" aria-label="${ko ? 'KO' : 'Skóre ' + sc(v) + ' z 5'}"><div><b>${ko ? 'KO' : sc(v)}</b><span>${ko ? '' : 'z 5'}</span></div></div>` : '';
  const body = { prehled: tabPrehled, analyza: tabAnalyza, poznamky: tabPoznamky }[tab](d, it);
  return `<div class="dt"><div class="hero" data-th="${id}"><button class="back" data-a="back" aria-label="Zpět na nabídky">${I.back}</button>${d.url ? `<a class="all" href="${esc(d.url)}" target="_blank" rel="noopener">Všechny fotky ${I.ext}</a>` : ''}</div>
    <div class="sheet"><div class="head"><div style="min-width:0"><h1>${esc(titleOf(d))}</h1><div class="u">${esc(placeOf(d.lokalita) || d.nazev)}</div><div class="p">${kc(d.cena)}</div></div>${ring}</div>
      <div class="tabs" role="tablist" aria-label="Části detailu">${TABS.map(([k, l]) => `<button role="tab" data-tab="${k}" class="${k === tab ? 'on' : ''}" aria-selected="${k === tab}">${l}</button>`).join('')}</div>
      <div class="panel">${body}</div></div>
    ${d.url ? `<div class="bottom"><a class="btn" href="${esc(d.url)}" target="_blank" rel="noopener">${d.vlastni ? 'Stránka nabídky' : 'Inzerát na Sreality'} ${I.ext}</a></div>` : ''}</div>`;
}
function wireDetail(root, id) {
  root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { history.replaceState(null, '', `#/n/${id}?t=${b.dataset.tab}`); const tabs = root.querySelector('.tabs'), y = window.scrollY, top = tabs.getBoundingClientRect().top + y; render().then(() => window.scrollTo(0, Math.min(y, top))); }));
}
async function viewReport(id) {
  const d = await DB.get('docs', id);
  const md = d && d.analyza && d.analyza.md;
  return `<div class="rp-top"><button class="ibtn" data-a="back" aria-label="Zpět">${I.back}</button><b>${d ? esc(placeOf(d.lokalita) || titleOf(d)) : 'Report'}</b></div><div class="md">${md ? MD.render(md) : '<div class="empty">Report není k dispozici.</div>'}</div>`;
}
function viewProhlidky() {
  const all = [];
  for (const it of idxItems()) for (const p of it.prohlidky || []) if (p.datum) all.push({ it, p });
  const fut = all.filter(x => upcoming(x.p)).sort((a, b) => a.p.datum.localeCompare(b.p.datum));
  const past = all.filter(x => !upcoming(x.p)).sort((a, b) => b.p.datum.localeCompare(a.p.datum));
  const row = ({ it, p }) => { const d = new Date(p.datum); return `<a class="card" href="#/n/${it.id}"><div class="th" data-th="${it.id}" style="width:64px;height:64px"></div><div class="bd"><div class="tags"><span class="tag date">${DNY[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.${p.cas ? ' ' + esc(p.cas) : ''}</span>${p.dojem ? `<span class="tag">dojem ${p.dojem}/5</span>` : ''}</div><div class="t">${esc(placeOf(it) || titleOf(it))}</div><div class="u">${esc(titleOf(it))} · ${kc(it.cena)}</div>${p.pozn ? `<div class="u">${esc(p.pozn)}</div>` : ''}</div><button class="x" data-a="pr-del" data-nid="${it.id}" data-m="${esc(JSON.stringify({ id: p.id, datum: p.datum, pozn: p.pozn || '' }))}" aria-label="Smazat prohlídku">×</button></a>`; };
  return `<div class="scr"><div class="top"><h1 class="h1">Prohlídky</h1><button class="sm pri" data-a="plan">+ Naplánovat</button></div>
    <div class="sec"><h2>Naplánované</h2><span>${fut.length}</span></div><div class="list">${fut.map(row).join('') || '<div class="empty">Žádná naplánovaná prohlídka.</div>'}</div>
    ${past.length ? `<div class="sec"><h2>Proběhlé</h2><span>${past.length}</span></div><div class="list">${past.map(row).join('')}</div>` : ''}</div>${nav('prohlidky')}`;
}
function viewMapa() {
  return `<div class="scr"><h1 class="h1">Mapa nabídek</h1><div class="box"><div class="big">Mapa přibude v další etapě</div><p class="muted">Nabídky obarvené podle skóre, vaše měření hluku a hluková mapa v noci. Zatím ji najdete v rozšíření v počítači (menu RealitAI → Mapa nabídek).</p></div></div>${nav('mapa')}`;
}
let installEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
async function viewNastaveni() {
  let est = null;
  try { est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch (_) {}
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent), standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const n = (S.index || []).length, conn = !!LS.get('connected');
  return `<div class="scr"><h1 class="h1">Nastavení</h1>
    <div class="grp-h">Google Drive</div>
    <div class="rows">
      <div class="r"><span class="k">${conn ? (token() ? 'Připojeno' : 'Přihlášení vypršelo') : 'Nepřipojeno'}<small>skrytá složka aplikace${S.at ? ` · synchronizováno ${ago(S.at)}` : ''}${S.serverAt ? ` · rozšíření odeslalo ${ago(new Date(S.serverAt).getTime())}` : ''}</small></span>${conn && token() ? `<button class="sm" data-a="sync-now">Synchronizovat</button>` : `<button class="sm" data-a="login">Přihlásit</button>`}</div>
      <div class="r"><span class="k">V telefonu uloženo</span><span class="v">${n} nabídek${est && est.usage ? ` · ${(est.usage / 1048576).toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} MB` : ''}</span></div>
    </div>
    <div class="grp-h">Odesílání do počítače</div>
    <div class="rows"><div class="r"><span class="k">Poznámky, měření, prohlídky<small>Odcházejí hned, i přes mobilní data (jednotky kB). Bez signálu počkají v telefonu.</small></span></div>
      <div class="r" data-outbox>${outboxRow()}</div></div>
    ${standalone ? '' : `<div class="grp-h">Na plochu</div><div class="rows"><div class="r"><span class="k">${ios ? 'V Safari klepněte na Sdílet → Přidat na plochu' : installEvt ? 'Nainstalovat aplikaci' : 'V Chrome otevřete ⋮ → Instalovat aplikaci'}<small>Aplikace se pak otevírá jako samostatná a funguje i offline.</small></span>${installEvt ? '<button class="sm" data-a="install">Instalovat</button>' : ''}</div></div>`}
    <div class="grp-h">Přihlašovací klient</div>
    <input class="field" data-a="client" value="${esc(clientId())}" placeholder="ID klienta Google" spellcheck="false" autocomplete="off">
    <p class="hint">Stejné ID jako v rozšíření (Nastavení → Telefon). Není to heslo – je veřejné.</p>
    <div style="margin-top:22px"><button class="btn danger" style="width:100%" data-a="wipe">Odpojit Google účet a smazat data z telefonu</button></div>
    <p class="hint">Verze ${APP_V} · etapa 2 (čtení a zápisy). Data zůstávají jen v telefonu a ve vaší skryté složce Google Drive.</p>
  </div>${nav('nastaveni')}`;
}
function viewIntro() {
  const err = sessionStorage.getItem('rai-loginErr');
  return `<div class="intro"><div class="logo"></div><h1>RealitAI v telefonu</h1>
    <p>Uložené nabídky, analýzy a data o lokalitě z rozšíření RealitAI – i bez signálu. Data jdou přes skrytou složku aplikace ve vašem Google Drive; aplikace nevidí nic jiného z vašeho Drive.</p>
    <label class="lbl" for="cid">ID klienta Google</label>
    <input class="field" id="cid" data-a="client" value="${esc(clientId())}" placeholder="1234…apps.googleusercontent.com" spellcheck="false" autocomplete="off">
    <button class="btn pri" data-a="login">Přihlásit se přes Google</button>
    ${err ? `<p class="err">Přihlášení se nepodařilo (${esc(err)}).</p>` : ''}
    <p class="hint">Napřed v rozšíření v počítači otevřete Nastavení → Telefon a připojte Google Drive – odtud aplikace data stáhne. Postup je v rozšíření v Nastavení → Telefon.</p></div>`;
}

// ---------- edits from the phone ----------
// Edits show up on the phone immediately (overlaying downloaded data) and are uploaded to Drive as zmeny-TIME-DEVICE.json;
// the extension applies them on its next run (within 5 min when the computer is on) and lists them in index.json (applied).
const DEV = LS.get('dev') || (() => { const d = Math.random().toString(36).slice(2, 8); LS.set('dev', d); return d; })();
const OB = { pending: [], sent: [] };
async function loadOutbox() { const o = await DB.get('meta', 'outbox'); if (o) { OB.pending = o.pending || []; OB.sent = o.sent || []; } }
const saveOutbox = () => DB.put('meta', 'outbox', { pending: OB.pending, sent: OB.sent });
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
async function queueOp(o) {
  o = Object.assign({ cid: newId(), at: new Date().toISOString() }, o);
  if (o.op === 'notes.set' || o.op === 'postup.stav') OB.pending = OB.pending.filter(x => !(x.op === o.op && x.nid === o.nid)); // keep the latest version only
  OB.pending.push(o);
  await saveOutbox();
  flushSoon();
}
let flushT = null;
const flushSoon = (ms = 1500) => { clearTimeout(flushT); flushT = setTimeout(() => flush(), ms); };
async function flush(manual) {
  if (!OB.pending.length || S.flushing) return drawOutbox();
  if (!navigator.onLine || !token()) { if (manual && !token()) syncNow(true); return drawOutbox(); }
  S.flushing = true; drawOutbox();
  const ops = OB.pending.slice(), name = `zmeny-${Date.now()}-${DEV}.json`;
  try {
    await apiUpload(name, JSON.stringify({ device: DEV, at: new Date().toISOString(), ops }));
    OB.pending = OB.pending.filter(x => !ops.includes(x)); OB.sent.push({ file: name, ops, at: Date.now() });
    await saveOutbox();
  } catch (e) { if (e instanceof NeedLogin) S.needLogin = true; } finally { S.flushing = false; drawOutbox(); }
}
async function apiUpload(name, body) {
  const t = token();
  if (!t) throw new NeedLogin('Přihlášení vypršelo');
  const b = 'rai' + newId();
  const r = await fetch(apiBase() + '/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': `multipart/related; boundary=${b}` },
    body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: ['appDataFolder'] })}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--` });
  if (r.status === 401) { LS.del('token'); throw new NeedLogin('Přihlášení vypršelo'); }
  if (!r.ok) throw new Error(`Google Drive ${r.status}`);
}
function outboxRow() {
  const n = OB.pending.length, w = OB.sent.length;
  if (S.flushing) return `<span class="k">Odesílám…</span>`;
  if (n) return `<span class="k">Čeká na odeslání: ${n} ${n === 1 ? 'změna' : n < 5 ? 'změny' : 'změn'}<small>${navigator.onLine ? (token() ? 'odešle se za chvíli' : 'po přihlášení') : 'bez signálu – odešle se po připojení'}</small></span><button class="sm" data-a="flush">Odeslat teď</button>`;
  if (w) return `<span class="k">Odesláno<small>${w} ${w === 1 ? 'dávka čeká' : 'dávky čekají'}, až je rozšíření v počítači zpracuje (do 5 min, když je počítač zapnutý)</small></span>`;
  return `<span class="k">Vše odesláno</span>`;
}
function drawOutbox() { const r = document.querySelector('[data-outbox]'); if (r) r.innerHTML = outboxRow(); }
addEventListener('online', () => flushSoon(500));

// overlay downloaded data with local edits (until the extension applies them)
const myOps = nid => OB.sent.flatMap(x => x.ops).concat(OB.pending).filter(o => o.nid === nid);
const sameItem = (x, m) => m && ((m.id && x.id === m.id) || (!m.id && x.datum === m.datum && (x.pozn || '') === (m.pozn || '') && (x.nabidka || null) === (m.nabidka || null)));
function applyLocal(d, o) {
  const p = d.postup = Object.assign({ prohlidky: [], jednani: [] }, d.postup || {});
  p.prohlidky = (p.prohlidky || []).slice(); p.jednani = (p.jednani || []).slice();
  const add = (k, it) => { if (!p[k].some(x => it.id && x.id === it.id)) p[k].push(Object.assign({ local: true }, it)); };
  const del = (k, m) => { const i = p[k].findIndex(x => sameItem(x, m)); if (i >= 0) p[k].splice(i, 1); };
  if (o.op === 'notes.set') d.poznamky = { html: o.html, text: o.text, at: o.at, local: true };
  else if (o.op === 'mereni.add') { d.mereni = (d.mereni || []).slice(); if (!d.mereni.some(x => x.t === o.item.t)) d.mereni.push(Object.assign({ local: true }, o.item)); }
  else if (o.op === 'mereni.del') d.mereni = (d.mereni || []).filter(x => x.t !== o.t);
  else if (o.op === 'postup.stav') { p.stav = o.stav; p.duvod = o.duvod; p.stavAt = o.at; }
  else if (o.op === 'prohlidka.add') add('prohlidky', o.item);
  else if (o.op === 'prohlidka.del') del('prohlidky', o.match);
  else if (o.op === 'jednani.add') add('jednani', o.item);
  else if (o.op === 'jednani.del') del('jednani', o.match);
  else if (o.op === 'konecna.set') p.konecna = o.konecna;
  return d;
}
async function getDoc(id) { const d = await DB.get('docs', id); if (!d) return d; const ops = myOps(id); return ops.length ? ops.reduce(applyLocal, JSON.parse(JSON.stringify(d))) : d; }
// list summaries (status, visits) adjusted by local edits
function idxItems() {
  const items = S.index || [];
  if (!OB.pending.length && !OB.sent.length) return items;
  return items.map(it => { const ops = myOps(it.id).filter(o => /^(postup\.stav|prohlidka\.)/.test(o.op)); if (!ops.length) return it;
    const d = ops.reduce(applyLocal, { postup: { stav: it.stav, prohlidky: (it.prohlidky || []).slice(), jednani: [] } });
    return Object.assign({}, it, { stav: d.postup.stav, prohlidky: d.postup.prohlidky }); });
}

// bottom sheet with a form
function sheet(title, body, onOk, okLabel = 'Uložit') {
  const el = document.createElement('div');
  el.className = 'shbg';
  el.innerHTML = `<div class="sh" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="shh"><b>${esc(title)}</b><button type="button" class="ibtn" data-x aria-label="Zavřít">×</button></div><form class="shb" novalidate>${body}<button class="btn pri" type="submit">${okLabel}</button></form></div>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-x]')) close(); });
  el.querySelectorAll('.chips2 button').forEach(b => b.addEventListener('click', () => { const g = b.parentElement; g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b && !x.classList.contains('on') ? true : false)); const inp = el.querySelector(`[name="${g.dataset.name}"]`); if (inp) inp.value = b.classList.contains('on') ? b.dataset.v : ''; }));
  el.querySelector('form').addEventListener('submit', async e => { e.preventDefault(); const v = Object.fromEntries(new FormData(e.target)); const err = await onOk(v, el); if (err) { const p = el.querySelector('.sherr') || el.querySelector('.shb').insertAdjacentElement('afterbegin', Object.assign(document.createElement('p'), { className: 'sherr err' })); p.textContent = err; return; } close(); render(); });
  setTimeout(() => { const f = el.querySelector('input:not([type=hidden]), select'); if (f && f.dataset.focus) f.focus(); }, 50);
  return el;
}
const MISTA = ['ložnice, okna zavřená', 'ložnice, okna otevřená', 'obývák', 'balkon', 'venku před domem', 'dvůr'];
const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const ACTIONS = {
  'meas-add': () => { const id = route().id; sheet('Měření hluku', `<label class="lbl">Hodnota (dB)</label><input class="field big" name="db" type="number" inputmode="decimal" min="10" max="130" step="0.1" data-focus="1" placeholder="např. 42">
      <label class="lbl">Kde</label><div class="chips2" data-name="misto">${MISTA.map(m => `<button type="button" data-v="${esc(m)}">${esc(m)}</button>`).join('')}</div>
      <input class="field" name="misto" placeholder="nebo vlastní popis"><label class="lbl">Kdy</label><input class="field" name="t" type="datetime-local" value="${nowLocal()}">`,
    v => { const db = Number(String(v.db).replace(',', '.')); if (!(db >= 10 && db <= 130)) return 'Zadejte hodnotu v dB (10–130).';
      return void queueOp({ nid: id, op: 'mereni.add', item: { db: Math.round(db * 10) / 10, misto: v.misto.trim(), t: v.t ? new Date(v.t).toISOString() : new Date().toISOString() } }); }, 'Přidat měření'); },
  'meas-del': a => { if (confirm('Smazat toto měření?')) queueOp({ nid: route().id, op: 'mereni.del', t: a.dataset.t }).then(render); },
  'pr-del': a => { if (confirm('Smazat tuto prohlídku?')) queueOp({ nid: +a.dataset.nid, op: 'prohlidka.del', match: JSON.parse(a.dataset.m) }).then(render); },
  'plan': () => planSheet(null),
};
// Visit: for a given offer (id) or with an offer picker (Visits → Schedule)
function planSheet(id) {
  const items = idxItems().filter(it => it.ulozeno !== false || it.vlastni);
  const pick = id ? '' : `<label class="lbl">Nabídka</label><input class="field" data-a="plan-q" placeholder="Hledat ulici, čtvrť…" autocomplete="off"><div class="pick" data-pick>${pickList(items, '')}</div><input type="hidden" name="nid">`;
  const el = sheet(id ? 'Prohlídka' : 'Naplánovat prohlídku', `${pick}<label class="lbl">Datum</label><input class="field" name="datum" type="date" value="${today()}">
    <label class="lbl">Čas (nepovinné)</label><input class="field" name="cas" type="time"><label class="lbl">Dojem (po prohlídce)</label><div class="chips2" data-name="dojem">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-v="${n}">${n}</button>`).join('')}</div><input type="hidden" name="dojem">
    <label class="lbl">Poznámka</label><input class="field" name="pozn" placeholder="co jste zjistil (hluk, světlo, sousedé, stav…)">`,
  async v => { const nid = id || +v.nid; if (!nid) return 'Vyberte nabídku.'; if (!v.datum) return 'Zadejte datum.';
    await queueOp({ nid, op: 'prohlidka.add', item: { id: newId(), datum: v.datum, cas: v.cas || '', dojem: +v.dojem || null, pozn: v.pozn.trim() } });
}, id ? 'Uložit' : 'Naplánovat');
  if (!id) {
    const q = el.querySelector('[data-a=plan-q]'), box = el.querySelector('[data-pick]'), hid = el.querySelector('[name=nid]');
    q.addEventListener('input', () => { box.innerHTML = pickList(items, q.value); });
    box.addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (!b) return; hid.value = b.dataset.id; box.querySelectorAll('[data-id]').forEach(x => x.classList.toggle('on', x === b)); });
  }
}
function pickList(items, q) {
  const w = norm(q).trim().split(/\s+/).filter(Boolean);
  const l = items.filter(it => w.every(x => (it.q || '').includes(x) || norm(titleOf(it) + ' ' + placeOf(it)).includes(x))).slice(0, 30);
  return l.map(it => `<button type="button" data-id="${it.id}"><b>${esc(placeOf(it) || titleOf(it))}</b><span>${esc(titleOf(it))} · ${kc(it.cena)}</span></button>`).join('') || '<p class="muted">Nic neodpovídá.</p>';
}

// ---------- notes editor (same as in the extension) ----------
const ic = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const TB = [['bold', '<b>B</b>', 'Tučně'], ['italic', '<i>I</i>', 'Kurzíva'], ['underline', '<u>U</u>', 'Podtržení'], ['strikeThrough', '<s>S</s>', 'Přeškrtnutí'], '|',
  ['h3', '<b>H</b>', 'Nadpis'], ['insertUnorderedList', ic('<circle cx="5" cy="7" r="1.6"/><circle cx="5" cy="12" r="1.6"/><circle cx="5" cy="17" r="1.6"/><path d="M9 6.2h11v1.6H9zM9 11.2h11v1.6H9zM9 16.2h11v1.6H9z"/>'), 'Odrážky'],
  ['insertOrderedList', ic('<text x="2.5" y="9" font-size="6.5" font-weight="700">1</text><text x="2.5" y="18.5" font-size="6.5" font-weight="700">2</text><path d="M9 6.2h11v1.6H9zM9 15.7h11v1.6H9z"/>'), 'Číslovaný seznam'],
  ['outdent', ic('<path d="M3 4.2h18v1.6H3zM11 9.2h10v1.6H11zM11 13.2h10v1.6H11zM3 18.2h18v1.6H3zM7.5 8.5v6L3.5 11.5z"/>'), 'Zmenšit odsazení'],
  ['indent', ic('<path d="M3 4.2h18v1.6H3zM11 9.2h10v1.6H11zM11 13.2h10v1.6H11zM3 18.2h18v1.6H3zM3.5 8.5v6l4-3z"/>'), 'Zvětšit odsazení'], '|',
  ['link', ic('<path d="M10.6 13.4a1 1 0 0 1 0-1.4l3.5-3.5a2.5 2.5 0 1 1 3.5 3.5l-1.8 1.8 1.1 1.1 1.8-1.8a4 4 0 0 0-5.7-5.7L9.5 10.9a2.5 2.5 0 0 0 0 3.6z"/><path d="M13.4 10.6a1 1 0 0 1 0 1.4l-3.5 3.5a2.5 2.5 0 1 1-3.5-3.5l1.8-1.8-1.1-1.1-1.8 1.8a4 4 0 0 0 5.7 5.7l3.5-3.5a2.5 2.5 0 0 0 0-3.6z"/>'), 'Odkaz'],
  ['removeFormat', ic('<path d="M6 5h12v2h-5l-1.3 4.2-1.8-1.8L10.8 7H6zM4.3 3.9 20.1 19.7l-1.2 1.2-6.2-6.2L11 20H9l2-6.4-7.9-7.9z"/>'), 'Zrušit formátování']];
// text for AI: same Markdown as the extension (lists, ### headings, **bold**, _italic_, text (link), [obrázek N])
function noteText(ed) {
  let i = 0;
  const inl = n => [...n.childNodes].map(x => {
    if (x.nodeType === 3) return x.textContent;
    if (x.nodeType !== 1) return '';
    const t = x.tagName;
    if (t === 'BR') return '\n';
    if (t === 'SPAN' && x.dataset.nimg) return ` [obrázek ${++i}] `;
    if (/^(UL|OL|P|DIV|H3|H4|BLOCKQUOTE)$/.test(t)) return '\n' + blk(x, 0) + '\n';
    const c = inl(x);
    if (!c.trim()) return c;
    const [, l, core, r] = c.match(/^(\s*)([\s\S]*?)(\s*)$/), w = m => l + m + core + m + r; // keep spaces outside the markers (**bold** text)
    if (t === 'B' || t === 'STRONG') return w('**');
    if (t === 'I' || t === 'EM') return w('_');
    if (t === 'S' || t === 'STRIKE') return w('~~');
    if (t === 'A') { const h = x.getAttribute('href') || ''; return c.trim() === h ? h : `${c} (${h})`; }
    return c;
  }).join('');
  const list = (el, d) => { let k = 0; return [...el.children].map(li => {
    if (li.tagName === 'UL' || li.tagName === 'OL') return list(li, d + 1);
    if (li.tagName !== 'LI') return '';
    const sub = [...li.children].filter(x => x.tagName === 'UL' || x.tagName === 'OL');
    const own = li.cloneNode(true); own.querySelectorAll(':scope > ul, :scope > ol').forEach(x => x.remove());
    return '  '.repeat(d) + (el.tagName === 'OL' ? `${++k}. ` : '- ') + inl(own).replace(/\n+/g, ' ').trim() + sub.map(x => '\n' + list(x, d + 1)).join('');
  }).filter(Boolean).join('\n'); };
  const blk = (el, d) => { const t = el.tagName; if (t === 'UL' || t === 'OL') return list(el, d); if (t === 'H3' || t === 'H4') return '### ' + inl(el).trim(); if (t === 'BLOCKQUOTE') return blk2(el).split('\n').map(l => l ? '> ' + l : l).join('\n'); return inl(el); };
  const blk2 = el => [...el.childNodes].map(x => x.nodeType === 1 && /^(UL|OL|H3|H4|BLOCKQUOTE|P|DIV)$/.test(x.tagName) ? '\n' + blk(x, 0) + '\n' : inl({ childNodes: [x] })).join('');
  return blk2(ed).replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function wireNotes(root, id) {
  const ed = root.querySelector('[data-ned]');
  if (!ed) return;
  if (!ed.innerHTML.trim()) ed.innerHTML = ''; // an empty field shows the placeholder (:empty)
  ed.querySelectorAll('span[data-nimg]').forEach(x => x.setAttribute('contenteditable', 'false'));
  let base = null, dirty = false, t = null;
  DB.get('docs', id).then(raw => { base = raw && raw.poznamky ? raw.poznamky.at || null : null; });
  const save = async () => {
    clearTimeout(t); if (!dirty) return; dirty = false;
    const html = safeHtml(ed.innerHTML), text = noteText(ed);
    await queueOp({ nid: id, op: 'notes.set', html, text, base });
  };
  ed.addEventListener('input', e => {
    if (e.inputType === 'insertText' && (e.data === ' ' || e.data === '\u00a0')) { autoList() || autoLink(1); }
    dirty = true; clearTimeout(t); t = setTimeout(save, 1200);
  });
  ed.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && autoLink(0)) { dirty = true; } });
  ed.addEventListener('blur', save);
  // save before the screen is redrawn (tab switch, back) and when leaving the app
  const hide = () => { if (document.visibilityState === 'hidden') save(); };
  document.addEventListener('visibilitychange', hide);
  S.notesFlush = () => { save(); document.removeEventListener('visibilitychange', hide); document.removeEventListener('selectionchange', keepSel); };
  // auto-formatting while typing (as in the extension): "- " / "* " / "• " at line start = bullets, "1. " = numbering,
  // an address (http://, https://, www.) followed by space or Enter = link
  const up = re => { let n = getSelection().anchorNode; while (n && n !== ed) { if (n.nodeType === 1 && re.test(n.tagName)) return n; n = n.parentNode; } return null; };
  const caret = () => { const s2 = getSelection(); if (!s2.rangeCount || !s2.isCollapsed) return null; const r = s2.getRangeAt(0); return r.startContainer.nodeType === 3 && ed.contains(r.startContainer) ? r : null; };
  const lineStart = node => {
    let n = node; while (n.parentNode && n.parentNode !== ed && !/^(DIV|P|H3|H4|LI|BLOCKQUOTE)$/.test(n.parentNode.tagName)) n = n.parentNode;
    const r = document.createRange(); r.setStart(n.parentNode, 0);
    for (let p2 = n.previousSibling; p2; p2 = p2.previousSibling) if (p2.nodeName === 'BR' || (p2.nodeType === 1 && /^(DIV|P|H3|H4|UL|OL|BLOCKQUOTE)$/.test(p2.tagName))) { r.setStartAfter(p2); break; }
    return r;
  };
  function autoList() {
    const r = caret(); if (!r || up(/^(LI|H3|H4)$/)) return false;
    const lr = lineStart(r.startContainer); lr.setEnd(r.startContainer, r.startOffset);
    const m = lr.toString().match(/^([-*•–]|1[.)])[\s\u00a0]$/); if (!m) return false;
    const s2 = getSelection(); s2.removeAllRanges(); s2.addRange(lr); document.execCommand('delete');
    document.execCommand(m[1].startsWith('1') ? 'insertOrderedList' : 'insertUnorderedList');
    return true;
  }
  function autoLink(typed) {
    const r = caret(); if (!r || up(/^A$/)) return false;
    const node = r.startContainer, end = r.startOffset - typed, before = node.data.slice(0, end);
    const m = before.match(/(?:^|[\s\u00a0(])((?:https?:\/\/|www\.)[^\s\u00a0]+)$/); if (!m) return false;
    const url = m[1].replace(/[.,;:!?)\]'"]+$/, ''); if (url.length < 8) return false;
    const start = before.length - m[1].length, lr = document.createRange(); lr.setStart(node, start); lr.setEnd(node, start + url.length);
    const s2 = getSelection(); s2.removeAllRanges(); s2.addRange(lr);
    document.execCommand('createLink', false, /^www\./.test(url) ? 'https://' + url : url);
    s2.collapseToEnd(); for (let i = before.length - start - url.length + typed; i > 0; i--) s2.modify('move', 'forward', 'character');
    return true;
  }
  const sync = () => root.querySelectorAll('[data-cmd]').forEach(b => { let on = false; try { on = b.dataset.cmd === 'h3' ? /^h3$/i.test(document.queryCommandValue('formatBlock')) : ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'].includes(b.dataset.cmd) && document.queryCommandState(b.dataset.cmd); } catch (_) {} b.classList.toggle('on', !!on); });
  // remember the selection: on iPhone tapping a toolbar button takes the caret away and the command would do nothing
  let range = null;
  const keepSel = () => { const sl = getSelection(); if (sl.rangeCount && ed.contains(sl.anchorNode)) range = sl.getRangeAt(0).cloneRange(); sync(); };
  const restore = () => { ed.focus(); const sl = getSelection(); if (range) { sl.removeAllRanges(); sl.addRange(range); } else if (!ed.contains(sl.anchorNode)) { const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); sl.removeAllRanges(); sl.addRange(r); } };
  document.addEventListener('selectionchange', keepSel);
  root.querySelectorAll('[data-cmd]').forEach(b => {
    // run on touch (pointerdown with preventDefault keeps the selection; Safari then sends no click), keyboard via click
    b.addEventListener('pointerdown', e => { e.preventDefault(); run(); });
    b.addEventListener('click', e => { if (e.detail === 0) run(); });
    function run() {
      const c = b.dataset.cmd;
      restore();
      if (c === 'h3') document.execCommand('formatBlock', false, /^h3$/i.test(document.queryCommandValue('formatBlock')) ? 'div' : 'h3');
      else if (c === 'link') { let u = prompt('Adresa odkazu (prázdné = odebrat)', 'https://'); if (u === null) return; u = u.trim(); if (!u || u === 'https://') document.execCommand('unlink'); else document.execCommand('createLink', false, /^[\w.+-]+@[\w-]+\.[\w.]+$/.test(u) ? 'mailto:' + u : /^(https?:|mailto:)/i.test(u) ? u : 'https://' + u); }
      else document.execCommand(c, false, null);
      dirty = true; clearTimeout(t); t = setTimeout(save, 1200); sync();
    }
  });
}

// ---------- routing and rendering ----------
const scrollPos = new Map();
let curKey = '', renderSeq = 0;
function route() {
  const h = location.hash.replace(/^#\/?/, ''), [path, qs] = h.split('?'), p = path.split('/').filter(Boolean), q = new URLSearchParams(qs || '');
  if (p[0] === 'n' && p[1]) return { v: p[2] === 'report' ? 'report' : p[2] === 'poznamky' ? 'notes' : 'detail', id: +p[1], tab: q.get('t') };
  return { v: ['mapa', 'prohlidky', 'nastaveni'].includes(p[0]) ? p[0] : 'list' };
}
async function render() {
  if (S.notesFlush) { S.notesFlush(); S.notesFlush = null; } // save unsaved notes before the field disappears
  if (route().v === 'notes') { history.replaceState(null, '', `#/n/${route().id}?t=poznamky`); } // legacy link to the standalone editor
  const seq = ++renderSeq, r = route(), key = r.v + (r.id || '');
  const html = !LS.get('connected') && !(S.index || []).length ? viewIntro()
    : r.v === 'detail' ? await viewDetail(r.id, r.tab) : r.v === 'report' ? await viewReport(r.id)
    : r.v === 'prohlidky' ? viewProhlidky() : r.v === 'mapa' ? viewMapa() : r.v === 'nastaveni' ? await viewNastaveni() : viewList();
  if (seq !== renderSeq) return;
  $app.innerHTML = html;
  wireThumbs($app);
  if (r.v === 'list' && $app.querySelector('[data-a=q]')) wireList($app);
  if (r.v === 'detail') wireDetail($app, r.id);
  if (r.v === 'detail' && $app.querySelector('[data-ned]')) wireNotes($app, r.id);
  setNav(html.startsWith('<div class="intro">') ? null : r.v === 'list' ? '' : ['mapa', 'prohlidky', 'nastaveni'].includes(r.v) ? r.v : null);
  if (key !== curKey) { curKey = key; window.scrollTo(0, scrollPos.get(key) || 0); }
  stickTabs();
}
// sticky detail tabs: below the iPhone status bar
function stickTabs() { const t = document.querySelector('.tabs'); if (t) t.classList.toggle('stuck', t.getBoundingClientRect().top <= 1); }
addEventListener('scroll', () => { stickTabs(); if (curKey) scrollPos.set(curKey, window.scrollY); }, { passive: true });
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; // the app restores the list position on back
addEventListener('hashchange', render);
addEventListener('online', () => { if (S.error === 'offline') S.error = null; syncNow(); });
addEventListener('offline', () => { S.error = 'offline'; drawSync(); });
$app.addEventListener('click', async e => {
  const a = e.target.closest('[data-a]');
  if (!a) return;
  const act = a.dataset.a;
  if (act === 'back') { if (history.length > 1 && sessionStorage.getItem('rai-nav')) history.back(); else location.hash = route().v === 'report' ? `#/n/${route().id}` : '#/'; }
  else if (act in ACTIONS) { e.preventDefault(); ACTIONS[act](a); } // a button inside a card link must not open the detail
  else if (act === 'flush') flush(true);
  else if (act === 'sync' || act === 'sync-now' || act === 'sync-retry') syncNow(true);
  else if (act === 'login') { const c = $app.querySelector('[data-a=client]'); if (c && c.value.trim()) LS.set('clientId', c.value.trim()); if (!clientId()) { alert('Vložte ID klienta Google.'); return; } sessionStorage.setItem('rai-return', location.hash || '#/'); login(); }
  else if (act === 'install' && installEvt) { installEvt.prompt(); installEvt = null; }
  else if (act === 'wipe') {
    if (!confirm('Odpojit Google účet a smazat všechna data RealitAI z tohoto telefonu? Data v Google Drive a v počítači zůstanou.')) return;
    const t = token();
    if (t) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t), { method: 'POST', mode: 'no-cors' }).catch(() => {});
    await DB.clear(); OB.pending = []; OB.sent = []; ['token', 'connected', 'ui'].forEach(LS.del); S.index = null; S.at = null; S.thumbs.clear(); location.hash = '#/'; render();
  }
});
$app.addEventListener('change', e => { if (e.target.dataset.a === 'client') LS.set('clientId', e.target.value.trim()); });
addEventListener('hashchange', () => sessionStorage.setItem('rai-nav', '1'));

(async () => {
  takeToken();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  await loadLocal();
  await loadOutbox();
  await render();
  if (LS.get('connected')) syncNow();
  // when returning to the app (after a while) download changes
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !LS.get('connected')) return;
    // back from background: cancel and resume a download suspended by iOS; otherwise fetch changes after 10 min
    if (S.running) { if (Date.now() - S.last > 8000 && S.ctl) S.ctl.abort(); return; }
    if (!S.at || Date.now() - S.at > 10 * 60e3 || (S.total && S.done < S.total)) syncNow();
  });
})();
