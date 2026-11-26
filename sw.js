/* AI-assisted offline cache code. */
const CACHE = "utlt-shell-v29";
const SHELL = [
  "./", "./index.html", "./styles.css", "./data.js", "./ai.js", "./model.json", "./local_llm.js", "./llm-worker.js", "./app.js", "./demo.js", "./demo.css", "./niro.js", "./niro.css", "./screens.html", "./screen-map.css",
  "./vendor/jsQR.js", "./manifest.webmanifest", "./assets/utlt-icon.svg",
  "./assets/utlt-icon-192.png", "./assets/utlt-icon-512.png", "./assets/utlt-favicon-32.png",
  "./assets/UTLT-2C2C-pairing-qr.png", "./assets/UTLT-A014-pairing-qr.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(request, { ignoreSearch: true })) || Response.error();
  }));
});
