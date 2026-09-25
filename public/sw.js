self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

async function getCurrentSchoolLogoUrl() {
  try {
    const response = await fetch("/api/public-branding", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const logoUrl = payload?.branding?.logoUrl;
    return typeof logoUrl === "string" && /^https:\/\//i.test(logoUrl) ? logoUrl : null;
  } catch {
    return null;
  }
}

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

  event.waitUntil((async () => {
    const logoUrl = await getCurrentSchoolLogoUrl();
    await self.registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      data: { url },
      // Use the exact currently-active school logo uploaded in School Settings.
      // Fall back to the dedicated monochrome asset if the branding endpoint or
      // the R2 signed URL is unavailable.
      icon: logoUrl || "/notification-icon.png",
      badge: "/notification-badge.png",
      vibrate: [80, 40, 120],
    });
  })());
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
