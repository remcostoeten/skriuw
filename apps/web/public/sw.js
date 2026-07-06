/**
 * Skriuw service worker.
 *
 * Deliberately conservative: Next.js owns data freshness, so the worker only
 * (1) serves hashed /_next/static assets cache-first (immutable by contract),
 * (2) serves previously-visited page navigations stale-while-revalidate so the
 *     app shell opens instantly and, when offline, renders real chrome instead
 *     of the bare offline page,
 * (3) falls back to a cached offline page only when a navigation has no cached
 *     document and the network is unreachable, and
 * (4) leaves API and mutation traffic untouched.
 */
const CACHE_NAME = "skriuw-v2";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icon-192.png", "/icon-maskable-512.png", "/manifest.json"];

self.addEventListener("install", function (event) {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then(function (cache) {
				// Best-effort per asset: one failed fetch must not disable the
				// offline page and the rest of the precache (addAll is atomic).
				return Promise.allSettled(
					PRECACHE.map(function (url) {
						return cache.add(url);
					}),
				);
			})
			.then(function () {
				return self.skipWaiting();
			}),
	);
});

self.addEventListener("activate", function (event) {
	event.waitUntil(
		caches
			.keys()
			.then(function (keys) {
				return Promise.all(
					keys
						.filter(function (key) {
							return key !== CACHE_NAME;
						})
						.map(function (key) {
							return caches.delete(key);
						}),
				);
			})
			.then(function () {
				return self.clients.claim();
			}),
	);
});

self.addEventListener("fetch", function (event) {
	const request = event.request;
	if (request.method !== "GET") return;

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	// API traffic must always hit the network so reads stay fresh and the
	// worker never shadows server auth/errors.
	if (url.pathname.startsWith("/api/")) return;

	// Hashed build assets never change under the same URL: cache-first.
	if (url.pathname.startsWith("/_next/static/")) {
		event.respondWith(
			caches.match(request).then(function (cached) {
				if (cached) return cached;
				return fetch(request).then(function (response) {
					if (response.ok) {
						const clone = response.clone();
						caches.open(CACHE_NAME).then(function (cache) {
							cache.put(request, clone);
						});
					}
					return response;
				});
			}),
		);
		return;
	}

	// Page navigations: stale-while-revalidate. A previously-visited route is
	// served from cache immediately (native-feeling instant open) while a fresh
	// copy is fetched in the background for next time. This only caches the app
	// shell HTML; live note/journal data is fetched client-side afterwards, so
	// serving a stale document never surfaces stale user data.
	if (request.mode === "navigate") {
		event.respondWith(
			caches.open(CACHE_NAME).then(function (cache) {
				return cache.match(request).then(function (cached) {
					const network = fetch(request)
						.then(function (response) {
							if (response.ok) {
								cache.put(request, response.clone());
							}
							return response;
						})
						.catch(function () {
							// Offline with no cached document for this route:
							// fall back to the offline page. A missing precache
							// entry must still yield a Response; returning
							// undefined would surface as a TypeError page.
							return cache.match(OFFLINE_URL).then(function (offline) {
								return offline || Response.error();
							});
						});

					return cached || network;
				});
			}),
		);
	}
});
