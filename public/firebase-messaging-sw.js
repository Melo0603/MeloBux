/* global self */

self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  const notification = payload.notification || {};
  const data = payload.data || {};

  event.waitUntil(
    self.registration.showNotification(notification.title || "MeloBux", {
      body: notification.body || "Você tem uma atualização no pedido.",
      icon: "/icon.svg",
      badge: "/icon.svg",
      data
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const orderId = event.notification.data && event.notification.data.orderId;
  const url = orderId ? `/pedido/${orderId}` : "/";

  event.waitUntil(self.clients.openWindow(url));
});
