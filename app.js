// RealitAI v telefonu – etapa 1: čtení archivu z Google Drive (skrytá složka aplikace) a provoz offline.
// Data posílá rozšíření RealitAI (Nastavení → Telefon): index.json, n-ID.json, t-ID.jpg. Telefon je uloží do IndexedDB
// a stahuje jen soubory, jejichž otisk (appProperties.h) se změnil. Přihlášení Google = implicitní tok s přesměrováním,
// rozsah drive.appdata (aplikace nevidí nic jiného z Drive). Bez serveru.
'use strict';
const APP_V = '1.0.0';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const $app = document.getElementById('app');

// ---------- úložiště ----------
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem('rai-' + k)); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem('rai-' + k, JSON.stringify(v)); } catch (_) {} },
  del(k) { try { localStorage.removeItem('rai-' + k); } catch (_) {} }
};
const clientId = () => LS.get('clientId') || (window.RAI_CONFIG || {}).clientId || '';
const apiBase = () => LS.get('base') || 'https://www.googleapis.com'; // jiná adresa jen pro testy
const DB = (() => {
  let opening;
  const open = () => opening || (opening = new Promise((res, rej) => {
    const r = indexedDB.open('rai', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('docs'); d.createObjectStore('thumbs'); d.createObjectStore('meta'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = async (st, mode, fn) => { const d = await open(), t = d.transaction(st, mode), out = fn(t.objectStore(st)); await new Promise((res, rej) => { t.oncomplete = res; t.onerror = t.onabort = () => rej(t.error); }); return out; };
  return {
    get: async (st, k) => req((await open()).transaction(st).objectStore(st).get(k)),
    put: (st, k, v) => tx(st, 'readwrite', s => s.put(v, k)),
    del: (st, k) => tx(st, 'readwrite', s => s.delete(k)),
    keys: async st => req((await open()).transaction(st).objectStore(st).getAllKeys()),
    clear: async () => { for (const st of ['docs', 'thumbs', 'meta']) await tx(st, 'readwrite', s => s.clear()); }
  };
})();

// ---------- formátování ----------
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

// ---------- přihlášení Google ----------
const token = () => { const t = LS.get('token'); return t && t.exp > Date.now() + 60e3 ? t.t : null; };
function login(prompt) {
  const st = Math.random().toString(36).slice(2);
  sessionStorage.setItem('rai-state', st);
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.search = new URLSearchParams(Object.assign({ client_id: clientId(), response_type: 'token', redirect_uri: location.origin + location.pathname, scope: SCOPE, include_granted_scopes: 'true', state: st }, prompt ? { prompt } : {}));
  location.assign(u.href);
}
// Návrat z přihlášení: #access_token=…&expires_in=…&state=… (nebo #error=… při tichém obnovení)
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
  const r = await fetch(apiBase() + path, { headers: { Authorization: 'Bearer ' + t } });
  if (r.status === 401) { LS.del('token'); throw new NeedLogin('Přihlášení vypršelo'); }
  if (!r.ok) throw new Error(`Google Drive ${r.status}`);
  return as === 'blob' ? r.blob() : r.json();
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
    // tiché obnovení přihlášení (jednou za spuštění), jinak tlačítko Přihlásit
    if (LS.get('connected') && clientId() && !sessionStorage.getItem('rai-silent')) { sessionStorage.setItem('rai-silent', '1'); sessionStorage.setItem('rai-return', location.hash || '#/'); login('none'); return; }
    S.needLogin = true; render(); return;
  }
  S.running = true; S.error = null; S.needLogin = false; S.done = 0; S.total = 0; render();
  try {
    const files = await listFiles(), byName = new Map(files.map(f => [f.name, f]));
    const fi = byName.get('index.json');
    if (!fi) { S.error = 'empty'; return; }
    const meta = (await DB.get('meta', 'index')) || {}, ih = (fi.appProperties || {}).h;
    const idx = meta.h === ih && meta.items ? meta : await api(`/drive/v3/files/${fi.id}?alt=media`);
    const hs = (await DB.get('meta', 'hs')) || {}, ts = (await DB.get('meta', 'ts')) || {};
    const jobs = [];
    for (const it of idx.items) {
      if (hs[it.id] !== it.h && byName.get(`n-${it.id}.json`)) jobs.push({ k: 'n', it });
      if (it.t && ts[it.id] !== it.t && byName.get(`t-${it.id}.jpg`)) jobs.push({ k: 't', it });
    }
    S.total = jobs.length; render();
    let lastDraw = 0;
    await Promise.all([0, 1, 2, 3].map(async () => {
      for (let j; (j = jobs.shift());) {
        if (j.k === 'n') { await DB.put('docs', j.it.id, await api(`/drive/v3/files/${byName.get(`n-${j.it.id}.json`).id}?alt=media`)); hs[j.it.id] = j.it.h; }
        else { await DB.put('thumbs', j.it.id, await api(`/drive/v3/files/${byName.get(`t-${j.it.id}.jpg`).id}?alt=media`, 'blob')); ts[j.it.id] = j.it.t; S.thumbs.delete(j.it.id); }
        S.done++;
        if (Date.now() - lastDraw > 400) { lastDraw = Date.now(); await DB.put('meta', 'hs', hs); await DB.put('meta', 'ts', ts); drawSync(); }
      }
    }));
    // nabídky, které z archivu zmizely
    const live = new Set(idx.items.map(x => x.id));
    for (const k of await DB.keys('docs')) if (!live.has(k)) { await DB.del('docs', k); delete hs[k]; }
    for (const k of await DB.keys('thumbs')) if (!live.has(k)) { await DB.del('thumbs', k); delete ts[k]; }
    await DB.put('meta', 'hs', hs); await DB.put('meta', 'ts', ts);
    S.at = Date.now();
    await DB.put('meta', 'index', { h: ih, at: idx.at, items: idx.items, syncedAt: S.at });
    S.index = idx.items; S.serverAt = idx.at;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch (e) {
    if (e instanceof NeedLogin) { S.needLogin = true; if (manual && clientId()) { sessionStorage.setItem('rai-return', location.hash || '#/'); login(); return; } }
    else S.error = navigator.onLine ? e.message : 'offline';
  } finally { S.running = false; refresh(); }
}
// Po synchronizaci: když uživatel právě píše do hledání, překreslit jen seznam (nezavírat klávesnici)
function refresh() {
  const lbEl = document.querySelector('[data-lb]');
  if (lbEl && document.activeElement && document.activeElement.dataset.a === 'q') { lbEl.innerHTML = listBody(); wireThumbs(lbEl); drawSync(); return; }
  render();
}
// Stav synchronizace v hlavičce (překreslí jen pilulku, ne celý seznam)
function syncPill() {
  if (S.running) return `<span class="pill run"><span>Synchronizuji${S.total ? ` ${S.done} z ${S.total}` : '…'}</span></span>`;
  if (S.needLogin) return `<span class="pill err"><span>Přihlášení vypršelo</span></span>`;
  if (S.error === 'offline') return `<span class="pill off"><span>Offline${S.at ? ' · data ' + ago(S.at) : ''}</span></span>`;
  if (S.error === 'empty') return `<span class="pill off"><span>V Drive zatím nejsou data</span></span>`;
  if (S.error) return `<span class="pill err"><span>Chyba synchronizace</span></span>`;
  return S.at ? `<span class="pill">${I.ok}<span>Synchronizováno ${ago(S.at)}</span></span>` : '';
}
function drawSync() { const p = document.querySelector('[data-pill]'); if (p) p.innerHTML = syncPill(); const b = document.querySelector('[data-a=sync]'); if (b) b.classList.toggle('spin', S.running); }

// ---------- náhledy ----------
async function thumbUrl(id) {
  if (S.thumbs.has(id)) return S.thumbs.get(id);
  const b = await DB.get('thumbs', id), u = b ? URL.createObjectURL(b) : '';
  S.thumbs.set(id, u);
  return u;
}
const thumbObs = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { thumbObs.unobserve(e.target); fillThumb(e.target); } }), { rootMargin: '300px' }) : null;
async function fillThumb(el) { const u = await thumbUrl(+el.dataset.th); if (u) el.style.backgroundImage = `url("${u}")`; }
function wireThumbs(root) { root.querySelectorAll('[data-th]').forEach(el => thumbObs ? thumbObs.observe(el) : fillThumb(el)); }

// ---------- obrazovky ----------
const ui = Object.assign({ filtr: 'ulozene', q: '', shown: 40 }, LS.get('ui') || {}, { shown: 40 });
const saveUi = () => LS.set('ui', { filtr: ui.filtr });
const nav = cur => `<nav class="nav" aria-label="Hlavní navigace">${[['', 'Nabídky'], ['mapa', 'Mapa'], ['prohlidky', 'Prohlídky'], ['nastaveni', 'Nastavení']].map(([k, l]) =>
  `<a href="#/${k}" class="${cur === k ? 'on' : ''}"${cur === k ? ' aria-current="page"' : ''}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${cur === k ? 2.2 : 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I.nav[k]}</svg>${l}</a>`).join('')}</nav>`;
const planned = it => (it.prohlidky || []).filter(p => p.datum && p.datum >= today()).sort((a, b) => a.datum.localeCompare(b.datum))[0] || null;
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
  const items = S.index || [], f = FILTRY.find(x => x[0] === ui.filtr) || FILTRY[1];
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
  const items = S.index || [], f = FILTRY.find(x => x[0] === ui.filtr) || FILTRY[1];
  const banner = S.needLogin ? `<div class="banner"><span>Přihlášení ke Google vypršelo – data jsou z ${S.at ? ago(S.at) : 'minula'}.</span><button class="sm" data-a="login">Přihlásit</button></div>`
    : S.error && S.error !== 'offline' && S.error !== 'empty' ? `<div class="banner"><span>${esc(S.error)}</span><button class="sm" data-a="sync-retry">Zkusit znovu</button></div>`
    : S.error === 'empty' && !items.length ? `<div class="banner"><span>V Google Drive zatím nejsou data. V rozšíření RealitAI otevřete Nastavení → Telefon a klikněte na „Připojit Google Drive“.</span></div>` : '';
  return `<div class="scr">
    <div class="top"><div data-pill>${syncPill()}</div><button class="ibtn${S.running ? ' spin' : ''}" data-a="sync" aria-label="Synchronizovat teď">${I.sync}</button></div>
    ${banner}
    <h1 class="h1">Nabídky</h1>
    <label class="search">${I.search}<input type="search" data-a="q" value="${esc(ui.q)}" placeholder="Hledat ulici, čtvrť, poznámku…" aria-label="Hledat v nabídkách" enterkeyhint="search"></label>
    <div class="chips" role="tablist">${FILTRY.map(([k, l, fn]) => { const n = items.filter(fn).length; return k === 'vlastni' && !n ? '' : `<button class="chip${f[0] === k ? ' on' : ''}" data-f="${k}" role="tab" aria-selected="${f[0] === k}">${l}${k === 'analyza' || k === 'vse' ? '' : ' · ' + n}</button>`; }).join('')}</div>
    <div data-lb>${listBody()}</div>
  </div>${nav('')}`;
}
function wireList(root) {
  const inp = root.querySelector('[data-a=q]');
  // při psaní překreslit jen seznam (klávesnice v telefonu zůstane otevřená)
  const lb = () => { const el = root.querySelector('[data-lb]'); el.innerHTML = listBody(); wireThumbs(el); };
  inp.addEventListener('input', () => { ui.q = inp.value; ui.shown = 40; lb(); });
  root.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { ui.filtr = b.dataset.f; ui.shown = 40; saveUi(); root.querySelectorAll('[data-f]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); lb(); }));
  root.addEventListener('click', e => { if (e.target.closest('[data-a=more]')) { ui.shown += 60; lb(); } });
}

// detail nabídky
const TABS = [['prehled', 'Přehled'], ['analyza', 'Analýza'], ['poznamky', 'Poznámky'], ['postup', 'Můj postup']];
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
// Poznámky z editoru rozšíření: jen povolené značky, odkazy http(s)/mailto
function safeHtml(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html'), OK = /^(B|STRONG|I|EM|U|S|STRIKE|H3|UL|OL|LI|P|BR|DIV|A|BLOCKQUOTE|SPAN)$/;
  const walk = n => { for (const c of [...n.childNodes]) { if (c.nodeType === 1) { if (!OK.test(c.tagName)) { c.replaceWith(...c.childNodes); continue; } for (const a of [...c.attributes]) if (!(c.tagName === 'A' && a.name === 'href' && /^(https?:|mailto:)/i.test(a.value))) c.removeAttribute(a.name); if (c.tagName === 'A') { c.target = '_blank'; c.rel = 'noopener'; } walk(c); } else if (c.nodeType !== 3) c.remove(); } };
  walk(doc.body.firstChild);
  return doc.body.firstChild.innerHTML;
}
function tabPoznamky(d) {
  const out = [];
  if (d.poznamky) out.push(`<div class="box"><h3>Poznámky <small>${d.poznamky.at ? dat(d.poznamky.at) : ''}</small></h3><div class="notes">${d.poznamky.html ? safeHtml(d.poznamky.html) : esc(d.poznamky.text).replace(/\n/g, '<br>')}</div></div>`);
  if ((d.prilohy || []).length) out.push(`<div class="box"><h3>Přílohy</h3><div class="items">${d.prilohy.map(a => `<div class="it"><b>·</b><span>${esc(a.name)} <span class="muted">${a.size ? Math.round(a.size / 1024).toLocaleString('cs-CZ') + ' kB' : ''}</span></span></div>`).join('')}</div><p class="muted">Soubory příloh jsou zatím jen v rozšíření v počítači.</p></div>`);
  if ((d.mereni || []).length) out.push(`<div class="box"><h3>Měření hluku</h3><div class="items">${d.mereni.map(m => `<div class="it"><span><b class="db" style="background:${dbCol(m.db)}">${esc(m.db)}</b>${esc(m.misto || 'místo neuvedeno')}${m.t ? ` · ${new Date(m.t).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}</span></div>`).join('')}</div></div>`);
  return out.join('') || '<div class="empty">K nabídce zatím nejsou poznámky. Psát je půjde i v telefonu v další etapě.</div>';
}
function tabPostup(d) {
  const p = d.postup || {}, an = d.analyza, st = [];
  const step = (ok, now, title, sub, extra) => st.push({ ok, now, title, sub, extra });
  if (d.fav && d.fav.od) step(true, false, d.vlastni ? 'Přidáno do archivu' : 'Uloženo z inzerátu', dat(d.fav.od));
  if (an) step(true, false, 'Analýza hotová', an.ko.length ? 'KO' : `Skóre ${sc(an.skore)}${an.verdikt ? ' · ' + an.verdikt.slice(0, 60) : ''}`);
  for (const x of (p.prohlidky || []).slice().sort((a, b) => String(a.datum).localeCompare(String(b.datum)))) {
    const fut = x.datum >= today();
    step(!fut, fut, fut ? 'Prohlídka naplánována' : 'Prohlídka', [dat(x.datum), x.dojem ? `dojem ${x.dojem}/5` : ''].filter(Boolean).join(' · '), x.pozn);
  }
  for (const x of p.jednani || []) step(true, false, 'Jednání o ceně', [dat(x.datum), x.nabidka ? 'nabídka ' + kc(x.nabidka) : '', x.proti ? 'protinabídka ' + kc(x.proti) : ''].filter(Boolean).join(' · '), x.vysledek);
  if (p.konecna && p.konecna.cena) step(true, false, 'Konečná cena', [kc(p.konecna.cena), dat(p.konecna.datum), p.konecna.zdroj].filter(Boolean).join(' · '));
  const out = [];
  if (p.stav && STAVY[p.stav]) out.push(`<div class="box"><h3>Stav</h3><div class="big">${esc(STAVY[p.stav])}</div>${p.duvod ? `<p>${esc(p.duvod)}</p>` : ''}${p.stavAt ? `<p class="muted">Změněno ${dat(p.stavAt)}</p>` : ''}</div>`);
  if (st.length) out.push(`<div class="box tl">${st.map((s, i) => `<div class="st"><div><span class="dot${s.ok ? ' ok' : s.now ? ' now' : ''}">${s.ok ? I.ok : ''}</span>${i < st.length - 1 ? `<span class="ln${s.ok ? ' ok' : ''}"></span>` : ''}</div><div class="tx"><b>${esc(s.title)}</b><div>${esc(s.sub || '')}</div>${s.extra ? `<div>${esc(s.extra)}</div>` : ''}</div></div>`).join('')}</div>`);
  if ((d.zmeny || []).length) out.push(`<details class="box"><summary>Změny inzerátu</summary><div class="items">${d.zmeny.slice().reverse().map(c => `<div class="it"><b>·</b><span>${dat(c.t)} ${esc(c.co)}: <span class="muted">${esc(c.old || '–')}</span> → ${esc(c.new || '–')}</span></div>`).join('')}</div></details>`);
  return out.join('') || '<div class="empty">Zatím bez záznamů.</div>';
}
async function viewDetail(id, tab) {
  const d = await DB.get('docs', id), it = (S.index || []).find(x => x.id === id);
  if (!d) return `<div class="scr"><div class="top"><button class="ibtn" data-a="back" aria-label="Zpět">${I.back}</button></div><div class="empty">${S.running ? 'Nabídka se ještě stahuje…' : 'Nabídka není v telefonu.'}</div></div>`;
  tab = TABS.some(t => t[0] === tab) ? tab : 'prehled';
  const an = d.analyza, ko = an && an.ko.length > 0, v = an && an.skore;
  const ring = an ? `<div class="ring" style="background:conic-gradient(${scoreCol(v, ko)} 0 ${ko ? 100 : (v || 0) / 5 * 100}%, #E4DED7 0 100%)" aria-label="${ko ? 'KO' : 'Skóre ' + sc(v) + ' z 5'}"><div><b>${ko ? 'KO' : sc(v)}</b><span>${ko ? '' : 'z 5'}</span></div></div>` : '';
  const body = { prehled: tabPrehled, analyza: tabAnalyza, poznamky: tabPoznamky, postup: tabPostup }[tab](d, it);
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
  for (const it of S.index || []) for (const p of it.prohlidky || []) if (p.datum) all.push({ it, p });
  const fut = all.filter(x => x.p.datum >= today()).sort((a, b) => a.p.datum.localeCompare(b.p.datum));
  const past = all.filter(x => x.p.datum < today()).sort((a, b) => b.p.datum.localeCompare(a.p.datum));
  const row = ({ it, p }) => { const d = new Date(p.datum); return `<a class="card" href="#/n/${it.id}"><div class="th" data-th="${it.id}" style="width:64px;height:64px"></div><div class="bd"><div class="tags"><span class="tag date">${DNY[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.</span>${p.dojem ? `<span class="tag">dojem ${p.dojem}/5</span>` : ''}</div><div class="t">${esc(placeOf(it) || titleOf(it))}</div><div class="u">${esc(titleOf(it))} · ${kc(it.cena)}</div></div></a>`; };
  return `<div class="scr"><div class="top"><div data-pill>${syncPill()}</div></div><h1 class="h1">Prohlídky</h1>
    <div class="sec"><h2>Naplánované</h2><span>${fut.length}</span></div><div class="list">${fut.map(row).join('') || '<div class="empty">Žádná naplánovaná prohlídka. Prohlídku zapíšete v rozšíření v záložce Můj postup.</div>'}</div>
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
    ${standalone ? '' : `<div class="grp-h">Na plochu</div><div class="rows"><div class="r"><span class="k">${ios ? 'V Safari klepněte na Sdílet → Přidat na plochu' : installEvt ? 'Nainstalovat aplikaci' : 'V Chrome otevřete ⋮ → Instalovat aplikaci'}<small>Aplikace se pak otevírá jako samostatná a funguje i offline.</small></span>${installEvt ? '<button class="sm" data-a="install">Instalovat</button>' : ''}</div></div>`}
    <div class="grp-h">Přihlašovací klient</div>
    <input class="field" data-a="client" value="${esc(clientId())}" placeholder="ID klienta Google" spellcheck="false" autocomplete="off">
    <p class="hint">Stejné ID jako v rozšíření (Nastavení → Telefon). Není to heslo – je veřejné.</p>
    <div style="margin-top:22px"><button class="btn danger" style="width:100%" data-a="wipe">Odpojit Google účet a smazat data z telefonu</button></div>
    <p class="hint">Verze ${APP_V} · etapa 1 (čtení). Data zůstávají jen v telefonu a ve vaší skryté složce Google Drive.</p>
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
    <p class="hint">Napřed v rozšíření v počítači otevřete Nastavení → Telefon a připojte Google Drive – odtud aplikace data stáhne. Návod: soubor NAVOD.md.</p></div>`;
}

// ---------- směrování a vykreslení ----------
const scrollPos = new Map();
let curKey = '', renderSeq = 0;
function route() {
  const h = location.hash.replace(/^#\/?/, ''), [path, qs] = h.split('?'), p = path.split('/').filter(Boolean), q = new URLSearchParams(qs || '');
  if (p[0] === 'n' && p[1]) return { v: p[2] === 'report' ? 'report' : 'detail', id: +p[1], tab: q.get('t') };
  return { v: ['mapa', 'prohlidky', 'nastaveni'].includes(p[0]) ? p[0] : 'list' };
}
async function render() {
  const seq = ++renderSeq, r = route(), key = r.v + (r.id || '');
  const html = !LS.get('connected') && !(S.index || []).length ? viewIntro()
    : r.v === 'detail' ? await viewDetail(r.id, r.tab) : r.v === 'report' ? await viewReport(r.id)
    : r.v === 'prohlidky' ? viewProhlidky() : r.v === 'mapa' ? viewMapa() : r.v === 'nastaveni' ? await viewNastaveni() : viewList();
  if (seq !== renderSeq) return;
  if (key !== curKey) { scrollPos.set(curKey, window.scrollY); }
  $app.innerHTML = html;
  wireThumbs($app);
  if (r.v === 'list' && $app.querySelector('[data-a=q]')) wireList($app);
  if (r.v === 'detail') wireDetail($app, r.id);
  if (key !== curKey) { window.scrollTo(0, scrollPos.get(key) || 0); curKey = key; }
  stickTabs();
}
// lepkavé záložky detailu: pod stavovým řádkem iPhonu
function stickTabs() { const t = document.querySelector('.tabs'); if (t) t.classList.toggle('stuck', t.getBoundingClientRect().top <= 1); }
addEventListener('scroll', stickTabs, { passive: true });
addEventListener('hashchange', render);
addEventListener('online', () => { if (S.error === 'offline') S.error = null; syncNow(); });
addEventListener('offline', () => { S.error = 'offline'; drawSync(); });
$app.addEventListener('click', async e => {
  const a = e.target.closest('[data-a]');
  if (!a) return;
  const act = a.dataset.a;
  if (act === 'back') { if (history.length > 1 && sessionStorage.getItem('rai-nav')) history.back(); else location.hash = route().v === 'report' ? `#/n/${route().id}` : '#/'; }
  else if (act === 'sync' || act === 'sync-now' || act === 'sync-retry') syncNow(true);
  else if (act === 'login') { const c = $app.querySelector('[data-a=client]'); if (c && c.value.trim()) LS.set('clientId', c.value.trim()); if (!clientId()) { alert('Vložte ID klienta Google.'); return; } sessionStorage.setItem('rai-return', location.hash || '#/'); login(); }
  else if (act === 'install' && installEvt) { installEvt.prompt(); installEvt = null; }
  else if (act === 'wipe') {
    if (!confirm('Odpojit Google účet a smazat všechna data RealitAI z tohoto telefonu? Data v Google Drive a v počítači zůstanou.')) return;
    const t = token();
    if (t) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t), { method: 'POST', mode: 'no-cors' }).catch(() => {});
    await DB.clear(); ['token', 'connected', 'ui'].forEach(LS.del); S.index = null; S.at = null; S.thumbs.clear(); location.hash = '#/'; render();
  }
});
$app.addEventListener('change', e => { if (e.target.dataset.a === 'client') LS.set('clientId', e.target.value.trim()); });
addEventListener('hashchange', () => sessionStorage.setItem('rai-nav', '1'));

(async () => {
  takeToken();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  await loadLocal();
  await render();
  if (LS.get('connected')) syncNow();
  // při návratu do aplikace (po delší době) stáhnout změny
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && LS.get('connected') && (!S.at || Date.now() - S.at > 10 * 60e3)) syncNow(); });
})();
