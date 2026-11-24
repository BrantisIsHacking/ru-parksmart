// Minimal service worker: makes the app installable and lets the shell open
// offline. API responses are never cached (congestion must be fresh).
const CACHE = "rups-shell-v2";
const SHELL = ["/", "/chat", "/report", "/onboarding", "/privacy", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  // Network first; fall back to the cached shell when offline.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok && event.request.mode === "navigate") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match("/"))),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || "RU ParkSmart", {
      body: data.body || "",
      icon: "/icon.svg",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list[0];
      if (open && "focus" in open) {
        // navigate() rejects for uncontrolled clients: fall back to a new window.
        return open
          .focus()
          .then((c) => (c && "navigate" in c ? c.navigate(url) : self.clients.openWindow(url)))
          .catch(() => self.clients.openWindow(url));
      }
      return self.clients.openWindow(url);
    }),
  );
});
