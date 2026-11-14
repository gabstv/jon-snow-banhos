/* Service worker do app Jon Snow — Banhos (v3)
   HTML, JS e CSS: rede primeiro, cache só se estiver offline.
   Ícones e demais arquivos: cache primeiro.
*/
const CACHE = "jonsnow-banhos-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./favicon.ico",
  "./vendor/qrcode.min.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isNetworkFirst(request, url) {
  const dest = request.destination;
  if (dest === "document" || dest === "script" || dest === "style") return true;
  const path = url.pathname;
  if (path.endsWith("/") || path.endsWith(".html") || path.endsWith(".js") || path.endsWith(".css")) {
    return true;
  }
  return false;
}

async function fromCache(request) {
  const direct = await caches.match(request);
  if (direct) return direct;
  const url = new URL(request.url);
  if (request.mode === "navigate" || request.destination === "document") {
    return (await caches.match("./index.html")) || (await caches.match("./"));
  }
  const relative = "." + url.pathname.replace(/.*\//, "/");
  return (await caches.match(url.pathname)) || (await caches.match(relative));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isNetworkFirst(req, url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok && (res.type === "basic" || res.type === "default")) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => fromCache(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req)
        .then((res) => {
          if (res && res.ok && (res.type === "basic" || res.type === "default")) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
