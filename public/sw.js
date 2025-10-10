// public/sw.js

// NEW: Updated cache version to force a refresh
const CACHE_NAME = "dockscan-v3";
// NEW: Updated the list of files to include our new pages
const urlsToCache = [
    "/",
    "/index.html",
    "/main-menu.html",
    "/scanner.html",
    "/styles.css"
];

// --- Install a new service worker and cache the app shell ---
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log("Opened cache");
        return cache.addAll(urlsToCache);
      })
  );
});

// --- Activate the new service worker and remove old caches ---
self.addEventListener("activate", event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log("Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// --- Serve cached content when offline ---
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        // Not in cache - fetch from network
        return fetch(event.request);
      }
    )
  );
});