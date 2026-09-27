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

    return typeof logoUrl === "string" && /^https:\/\//i.test(logoUrl)
      ? logoUrl
      : null;
  } catch {
    return null;
  }
}

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: "School notification",
      body:
        event.data?.text?.() ||
        "You have a new notification.",
    };
  }

  const title = String(
    payload.title || "School notification"
  );

  const body = String(payload.body || "");

  const url =
    typeof payload.url === "string" &&
    payload.url.startsWith("/")
      ? payload.url
      : "/notifications";

  const tag =
    typeof payload.tag === "string" && payload.tag
      ? payload.tag
      : `notification-${Date.now()}`;

  event.waitUntil(
    (async () => {
      const logoUrl = await getCurrentSchoolLogoUrl();

      await self.registration.showNotification(title, {
        body,
        tag,
        renotify: true,

        // Store the route so notificationclick can open it.
        data: {
          url,
        },

        // Current school logo, with fallback.
        icon: logoUrl || "/notification-icon.png",
        badge: "/notification-badge.png",

        vibrate: [80, 40, 120],
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const rawTarget = event.notification?.data?.url;

  const target =
    typeof rawTarget === "string" &&
    rawTarget.startsWith("/")
      ? rawTarget
      : "/notifications";

  event.waitUntil(
    self.clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then((clients) => {
        /*
         * IMPORTANT:
         * The app uses React HashRouter.
         *
         * Correct:
         *   /#/notifications
         *   /#/messages
         *   /#/events
         *
         * Incorrect:
         *   /notifications
         *   /messages
         *   /events
         *
         * Opening the second form makes HashRouter see an unknown
         * pathname and show the "Required access: A valid route" page.
         */
        const hashRoute = target.startsWith("/#/")
          ? target
          : `/#${target}`;

        const absoluteUrl = new URL(
          hashRoute,
          self.location.origin
        ).href;

        /*
         * Reuse any open app window on this origin.
         * This avoids opening duplicate tabs/windows.
         */
        const existingClient = clients.find((client) => {
          try {
            return (
              new URL(client.url).origin ===
              self.location.origin
            );
          } catch {
            return false;
          }
        });

        if (existingClient) {
          return existingClient.focus();
        }

        return self.clients.openWindow(absoluteUrl);
      })
  );
});
