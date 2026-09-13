const CACHE_NAME = "shell-v2";
const SHELL_URLS = ["/", "/manifest.json", "/client.js"];
// "/" is a dynamic document (records a visit, lists the gallery) and
// /client.js changes on every deploy, so both must hit the network first and
// use the cache only as an offline fallback. /manifest.json is static.
const NETWORK_FIRST_URLS = ["/", "/client.js"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  if (url.pathname.startsWith("/image/")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        const fetchPromise = fetch(event.request)
          .then((response) => {
            // KV is eventually consistent: a fresh upload can 404 briefly at
            // some edges. Caching that 404 would hide the image forever.
            if (response.ok) cache.put(event.request, response.clone()).catch(() => {});
            return response;
          })
          .catch(() => cached || new Response(null, { status: 503 }));
        return cached || fetchPromise;
      })
    );
    return;
  }

  if (NETWORK_FIRST_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          const response = await fetch(event.request);
          if (response.ok) cache.put(event.request, response.clone()).catch(() => {});
          return response;
        } catch (err) {
          const cached = await cache.match(event.request);
          if (cached) return cached;
          throw err;
        }
      })
    );
    return;
  }

  if (SHELL_URLS.includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
  }
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : { title: "Notification", body: "" };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon.svg",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow("/");
    })
  );
});
