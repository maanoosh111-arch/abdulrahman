/* Service Worker for Real Web Push Notifications */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = {
      title: 'Order Update',
      body: event.data.text(),
    };
  }

  const orderCode = data.orderCode || 'ORD';
  const title = data.title || `Order (${orderCode})`;
  const body = data.body || `Your order (${orderCode}) status has been updated.`;
  const tag = data.tag || `order-finished-${orderCode}`;
  const targetUrl = data.url || `/?myOrders=1&orderCode=${encodeURIComponent(orderCode)}`;

  const options = {
    body,
    tag,
    renotify: false,
    data: {
      url: targetUrl,
      orderCode,
      orderId: data.orderId,
    },
    badge: '/favicon.ico',
    icon: '/favicon.ico',
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || '/?myOrders=1';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.postMessage({
              type: 'NOTIFICATION_CLICKED',
              url: targetUrl,
              orderCode: event.notification.data?.orderCode,
            });
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
