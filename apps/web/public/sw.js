/**
 * Skriuw service worker.
 *
 * Deliberately conservative: Next.js owns data freshness, so the worker only
 * (1) serves hashed /_next/static assets cache-first (immutable by contract),
 * (2) falls back to a cached offline page when a navigation fails, and
 * (3) leaves API and mutation traffic untouched.
 */
const CACHE_NAME = "skriuw-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icon-192.png", "/manifest.json"];

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

	// Page navigations: network-first, offline page as last resort.
	if (request.mode === "navigate") {
		event.respondWith(
			fetch(request).catch(function () {
				return caches.match(OFFLINE_URL).then(function (cached) {
					// A missing precache entry must still yield a Response;
					// returning undefined would surface as a TypeError page.
					return cached || Response.error();
				});
			}),
		);
	}
});
