/* SV/BSC Scout v3 – Service Worker (speichert nur die App-Hülle, nie Spielerdaten)
   - App-Seite: erst Netz (max. 4 s), sonst gespeicherte Version → startet auch im Funkloch
   - Icons/Wappen/Chart-Bibliothek: aus dem Speicher, im Hintergrund aufgefrischt
   - Sync (Make) und version.json laufen NIE über den Speicher */
const BUILD = '20260923-1650-r7b';
const CACHE = 'svbc-scout-' + BUILD;
const SHELL = ['./', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon-64.png', './crest.svg',
  './fonts/inter-var.woff2', './fonts/barlowc-700.woff2', './vendor/supabase.js?v=' + BUILD, './icons.js?v=' + BUILD, './boot.js?v=' + BUILD, './app.js?v=' + BUILD];
const PAGE_KEY = './';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(SHELL.map(u => fetch(new Request(u, { cache: 'no-cache' })).then(r => { if (r.ok) return c.put(u, r); }).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const cur = await caches.open(CACHE);
    if (!(await cur.match(PAGE_KEY))) {               /* Seite aus altem Speicher übernehmen, falls Neuladen offline scheiterte */
      for (const k of keys) { if (k === CACHE || !k.startsWith('svbc-scout-')) continue; const r = await (await caches.open(k)).match(PAGE_KEY); if (r) { await cur.put(PAGE_KEY, r); break; } }
    }
    await Promise.all(keys.filter(k => k.startsWith('svbc-scout-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isPage(req, url) {
  if (req.mode === 'navigate') return true;
  const scope = new URL(self.registration.scope);
  return url.origin === scope.origin && (url.pathname === scope.pathname || url.pathname === scope.pathname + 'index.html');
}

async function pageFirstNetwork(req) {
  const c = await caches.open(CACHE);
  const net = fetch(req.url.split('#')[0], { cache: 'no-cache', credentials: 'same-origin' }).then(r => {
    if (r && r.ok) c.put(PAGE_KEY, r.clone());
    return r;
  });
  const cached = await c.match(PAGE_KEY);
  if (!cached) return net;
  /* Netz hat 4 s Zeit; danach die gespeicherte Seite zeigen (das Netz aktualisiert im Hintergrund weiter) */
  return Promise.race([
    net.then(r => (r && r.ok) ? r : cached).catch(() => cached),
    new Promise(res => setTimeout(() => res(cached), 4000))
  ]);
}

async function assetStaleWhileRevalidate(req, key) {
  const c = await caches.open(CACHE);
  const hit = await c.match(key || req);            /* exakt (inkl. ?v=Build) – neue Version holt sich neuen Code */
  const upd = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(key || req, r.clone()); return r; }).catch(() => null);
  return hit || (await upd) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('make.com') || url.hostname.endsWith('supabase.co') || url.pathname.includes('/rest/v1/') || url.pathname.includes('/auth/v1/') || url.pathname.includes('/functions/v1/')) return;  /* Daten & Anmeldung nie speichern */
  if (url.pathname.endsWith('/version.json')) return;         /* Update-Prüfung immer live */
  const scope = new URL(self.registration.scope);
  if (isPage(req, url) && url.origin === scope.origin) { e.respondWith(pageFirstNetwork(req)); return; }
  if (url.origin === scope.origin && url.pathname.startsWith(scope.pathname)) { e.respondWith(assetStaleWhileRevalidate(req)); return; }
  if (url.hostname === 'cdnjs.cloudflare.com') { e.respondWith(assetStaleWhileRevalidate(req)); return; }
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

/* ---------- Erinnerungen (Push) ---------- */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  const title = String(d.title || 'SV/BSC Scout').slice(0, 120);
  const opts = { body: String(d.body || '').slice(0, 400), icon: './icon-192.png', badge: './favicon-64.png', tag: d.tag || 'svbc-scout',
    renotify: true, data: { url: d.url || './#kandidaten' }, lang: 'de' };
  e.waitUntil((async () => {
    await self.registration.showNotification(title, opts);
    try { if (self.navigator && self.navigator.setAppBadge) { if (d.n > 0) await self.navigator.setAppBadge(d.n); else await self.navigator.clearAppBadge(); } } catch (_) {}
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const scope = self.registration.scope;
  let target = scope;
  try { const u = new URL((e.notification.data && e.notification.data.url) || './#kandidaten', scope); if (u.origin === new URL(scope).origin) target = u.href; } catch (_) {}
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if (c.url.startsWith(scope)) { try { await c.focus(); c.postMessage({ svbcGo: target.split('#')[1] || 'kandidaten' }); return; } catch (_) {} }
    }
    await self.clients.openWindow(target);
  })());
});
