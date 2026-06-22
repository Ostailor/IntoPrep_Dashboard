const LEGACY_CACHE_PREFIX = "intoprep-portal";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith(LEGACY_CACHE_PREFIX))
          .map((cacheName) => caches.delete(cacheName)),
      );

      await self.registration.unregister();
      await self.clients.claim();

      const clients = await self.clients.matchAll({ type: "window" });

      clients.forEach((client) => {
        client.navigate(client.url);
      });
    })(),
  );
});
