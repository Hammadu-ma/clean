self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "School notification", body: event.data?.text?.() || "You have a new notification." };
  }

  const title = String(payload.title || "School notification");
  const body = String(payload.body || "");
  const url = typeof payload.url === "string" && payload.url.startsWith("/") ? payload.url : "/notifications";
  const tag = typeof payload.tag === "string" && payload.tag ? payload.tag : `notification-${Date.now()}`;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      data: { url },
      icon: "/notification-icon.png",
      badge: "/notification-badge.png",
      vibrate: [80, 40, 120],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification?.data?.url;
  if (!target) return;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const absolute = new URL(target, self.location.origin).href;
      const existing = clients.find((client) => client.url === absolute);
      return existing ? existing.focus() : self.clients.openWindow(absolute);
    })
  );
});
