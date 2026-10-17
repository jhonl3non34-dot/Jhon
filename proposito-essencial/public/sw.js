// Service Worker: funcionamento offline (casca do app), cache de mídia e notificações push.
const VERSAO = 'proposito-v3';
const CASCA = ['/', '/app.js', '/manifest.json', '/media/icon-192.png', '/media/icon-512.png', '/media/fundo.jpg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // API sempre pela rede (dados em tempo real)
  if (url.pathname.startsWith('/api/')) return;

  // Páginas: rede primeiro, com cópia offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((resp) => {
        const copia = resp.clone();
        caches.open(VERSAO).then((c) => c.put('/', copia));
        return resp;
      }).catch(() => caches.match('/'))
    );
    return;
  }

  // Demais arquivos: cache primeiro, atualiza em segundo plano
  event.respondWith(
    caches.match(req).then((emCache) => {
      const rede = fetch(req).then((resp) => {
        if (resp.ok) caches.open(VERSAO).then((c) => c.put(req, resp.clone()));
        return resp;
      }).catch(() => emCache);
      return emCache || rede;
    })
  );
});

// ----- Notificações push (site fechado) -----
self.addEventListener('push', (event) => {
  let dados = {};
  try { dados = event.data ? event.data.json() : {}; } catch { dados = { body: event.data && event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(dados.title || 'Palavra do dia', {
      body: dados.body || '',
      icon: '/media/icon-192.png',
      badge: '/media/icon-192.png',
      tag: 'palavra-do-dia',
      data: { url: dados.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const alvo = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const c of lista) if ('focus' in c) return c.focus();
      return self.clients.openWindow(alvo);
    })
  );
});
