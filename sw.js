// ============ OBRA360 · SERVICE WORKER ============
// Versión 2.0 — Web Push + Cache básico

const CACHE_NAME = 'obra360-v1';

// ── Instalación ──────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
});

// ── Activación ───────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

// ── Push recibido ────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { title: 'Obra360', body: event.data.text() };
  }

  const title   = payload.title || 'Obra360';
  const options = {
    body:    payload.body    || '',
    icon:    payload.icon    || '/icon-192.png',
    badge:   payload.badge   || '/icon-192.png',
    tag:     payload.tag     || 'obra360-notif',
    data:    payload.data    || {},
    vibrate: [200, 100, 200],
    actions: payload.actions || [],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ── Click en la notificación ─────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const obraId = event.notification.data?.obra_id;
  const url    = obraId ? `/?obra=${obraId}` : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Si la app ya está abierta, enfocarla
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if (obraId) client.postMessage({ type: 'OPEN_OBRA', obraId });
          return;
        }
      }
      // Si no está abierta, abrirla
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
