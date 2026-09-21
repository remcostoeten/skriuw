/**
 * Skriuw browser service worker.
 *
 * The renderer owns its own data: SQLite runs in a worker over OPFS and cloud
 * sync talks to another origin, so the worker never sees a durable write. It
 * only makes the shell start without a network:
 *   1. hashed build assets are served cache-first, immutable by contract,
 *   2. the shell document is served stale-while-revalidate so a cold launch
 *      paints from disk and picks up a new build in the background,
 *   3. everything else, including every request outside the registration
 *      scope, is left to the network untouched.
 *
 * A revalidated shell is never swapped under a running session: the waiting
 * worker announces itself and the page decides when to reload, so a cached
 * shell can never pair with a database the newer build already migrated.
 */
const CACHE_NAME = "skriuw-shell-v1";
const SHELL_URL = new URL("./", self.registration.scope).pathname;

function isAsset(pathname) {
  return pathname.startsWith(`${SHELL_URL}assets/`);
}

function inScope(url) {
  return url.origin === self.location.origin && url.pathname.startsWith(SHELL_URL);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.add(new Request(SHELL_URL, { cache: "reload" }));
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => {
              return key !== CACHE_NAME;
            })
            .map((key) => {
              return caches.delete(key);
            }),
        );
      })
      .then(() => {
        return self.clients.claim();
      }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skriuw:activate-update") {
    void self.skipWaiting();
  }
});

function cacheFirst(request) {
  return caches.open(CACHE_NAME).then((cache) => {
    return cache.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          void cache.put(request, response.clone());
        }
        return response;
      });
    });
  });
}

function shellResponse() {
  const request = new Request(SHELL_URL);
  return caches.open(CACHE_NAME).then((cache) => {
    return cache.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            void cache.put(request, response.clone());
          }
          return response;
        })
        .catch((error) => {
          if (cached) {
            return cached;
          }
          throw error;
        });
      return cached ?? network;
    });
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("range")) {
    return;
  }
  const url = new URL(request.url);
  if (!inScope(url)) {
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(shellResponse());
    return;
  }
  if (isAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
