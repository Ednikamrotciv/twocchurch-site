/* World Overcomers offline shell — one-click-everywhere fix.
   Return visits open the visitors site even with no network.
   Strategy: navigations + version/seed/feed/server are network-first with
   cache fallback (always fresh after Publish/rebuild, still live offline);
   hashed assets + photos are cache-first. The maintenance notice HTML is
   never cached as the site shell. Versioned by update + code word. */

const CACHE = "wom-shell-v422-clean422";

const CORE = [
  "/",
  "/index.html",
  "/404.html",
  "/version.json",
  "/seed.json",
  "/server.json",
  "/feed.json",
  "/src/assets/logo-mark.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        await cache.addAll(CORE.map((u) => new Request(u, { cache: "no-store" })).map((r) => r.url));
      } catch {
        /* first install offline — the next online visit fills the cache */
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      } catch {}
      await self.clients.claim();
    })()
  );
});

function isEntry(url) {
  const p = new URL(url).pathname;
  return p === "/" || p.endsWith("/index.html") || p === "/index.html" || p === "/404.html" || /^\/(admin|sermons|visit|watch|giving|prayer|about|contact|events|ministries|locations|devotional|library|testimonies)(\/.*)?$/.test(p);
}

function isLivePointer(url) {
  const p = new URL(url).pathname;
  return p.endsWith("/version.json") || p.endsWith("/seed.json") || p.endsWith("/server.json") || p.endsWith("/feed.json") || p.endsWith("/origin.json");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (isLivePointer(req.url) || isEntry(req.url)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(new Request(req.url, { cache: "no-store" }));
          try {
            const cache = await caches.open(CACHE);
            // Never cache a maintenance shell as the site: only cache entry
            // HTML that carries a baked release (wom-published) or the admin
            // console. Live pointers (version/seed) always cache (they are
            // the publish evidence offline return visits read).
            if (isLivePointer(req.url)) {
              cache.put(req.url, fresh.clone()).catch(() => {});
            } else {
              const text = await fresh.clone().text().catch(() => "");
              if (text.indexOf('name="wom-published"') >= 0 || url.pathname.indexOf("/admin") >= 0) {
                cache.put(req.url, fresh.clone()).catch(() => {});
              }
            }
          } catch {}
          return fresh;
        } catch {
          try {
            const cache = await caches.open(CACHE);
            const hit = await cache.match(req.url, { ignoreSearch: true });
            if (hit) return hit;
            if (isEntry(req.url)) {
              const shell = await cache.match("/index.html");
              if (shell) return shell;
            }
          } catch {}
          throw new Error("offline");
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        if (hit) {
          // Revalidate in background so photos/bundles stay fresh.
          fetch(req).then((fresh) => {
            if (fresh && fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
          }).catch(() => {});
          return hit;
        }
        const fresh = await fetch(req);
        if (fresh && fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        try {
          const cache = await caches.open(CACHE);
          const hit = await cache.match(req);
          if (hit) return hit;
        } catch {}
        throw new Error("offline");
      }
    })()
  );
});
