/* World Overcomers service worker — offline live site after publish (update 427).
 *
 * One Publish click must clear every browser/device, online OR offline. The
 * maintenance gates already fail open offline when cached published words
 * exist — but without this worker an offline open has no files at all
 * (entry files ship `no-store`, so the browser keeps nothing). This worker
 * keeps the last published copy on the device: after one online visit past a
 * publish, later offline opens paint the cached live site instead of an
 * error or a stuck maintenance notice.
 *
 * Maintenance notice stays active (the worker never decides maintenance — it
 * only files; the page gates still hold online until Publish). New deploys
 * still wipe old wakes: the cache name carries the update number + code word,
 * and activate deletes every other cache, so each new deploy opens fresh,
 * clean and new. Unsaved-change cleaning is untouched (cms.ts deploySeen).
 */

var CACHE = "wom-427-clean427";
var CORE = [
  "/",
  "/index.html",
  "/version.json",
  "/seed.json",
  "/server.json",
  "/feed.json",
  "/404.html",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(function (cache) {
        return Promise.all(
          CORE.map(function (url) {
            return cache.add(url).catch(function () {
              /* best effort — a missing optional file never blocks install */
            });
          })
        );
      })
      .then(function () {
        return self.skipWaiting();
      })
      .catch(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (key) {
            if (key !== CACHE) return caches.delete(key);
            return Promise.resolve(false);
          })
        );
      })
      .then(function () {
        return self.clients ? self.clients.claim() : undefined;
      })
  );
});

function isEntryUrl(url) {
  try {
    var p = new URL(url).pathname;
    return (
      p === "/sw.js" ||
      p === "/version.json" ||
      p === "/seed.json" ||
      p === "/server.json" ||
      p === "/feed.json" ||
      p === "/index.html" ||
      p === "/404.html" ||
      p === "/"
    );
  } catch (e) {
    return false;
  }
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (!req || req.method !== "GET") return;
  var url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf("/__cms/") === 0) return;
  if (url.pathname === "/__geo" || url.pathname === "/__rates" || url.pathname === "/__yt" || url.pathname === "/__live-url") return;
  if (url.pathname === "/__upload" || url.pathname === "/__restore-file" || url.pathname === "/__delete-file") return;

  /* Entry + publish-evidence files: network first (a publish clears on next
     online open within seconds), cache fallback offline. Successful network
     answers refresh the cache so the NEXT offline open is the published site. */
  if (isEntryUrl(req.url) || req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          try {
            if (res && res.ok) {
              var copy = res.clone();
              caches.open(CACHE).then(function (cache) {
                cache.put(req, copy).catch(function () {});
              }).catch(function () {});
            }
          } catch (e) {}
          return res;
        })
        .catch(function () {
          return caches.match(req, { ignoreSearch: true }).then(function (hit) {
            if (hit) return hit;
            /* Offline navigation with no exact match: the cached live shell. */
            if (req.mode === "navigate") {
              return caches.match("/index.html", { ignoreSearch: true }).then(function (shell) {
                return shell || caches.match("/", { ignoreSearch: true });
              });
            }
            return undefined;
          });
        })
    );
    return;
  }

  /* Hashed bundle assets + photos: cache first (names change per build), network fallback. */
  event.respondWith(
    caches.match(req, { ignoreSearch: false }).then(function (hit) {
      if (hit) return hit;
      return fetch(req)
        .then(function (res) {
          try {
            if (res && res.ok) {
              var copy = res.clone();
              caches.open(CACHE).then(function (cache) {
                cache.put(req, copy).catch(function () {});
              }).catch(function () {});
            }
          } catch (e) {}
          return res;
        })
        .catch(function () {
          return undefined;
        });
    })
  );
});
