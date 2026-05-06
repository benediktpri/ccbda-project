// This service worker exists solely to unregister stale service workers.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => {
  self.registration.unregister().then(() => {
    self.clients.matchAll().then((clients) => {
      clients.forEach((c) => c.navigate(c.url));
    });
  });
});
