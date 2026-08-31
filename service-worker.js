// ============================================================================
// service-worker.js
//
// Ein Service Worker ist ein kleines Skript, das im Hintergrund läuft und
// Netzwerk-Anfragen abfangen kann. Wir nutzen ihn hier nur für zwei Dinge:
//   1. Er ist Voraussetzung dafür, dass iOS die Seite als "richtige" App
//      installierbar macht ("Zum Home-Bildschirm hinzufügen").
//   2. Er legt die wichtigsten Dateien in einen Cache, damit die App auch
//      ohne Internetverbindung startet.
//
// CACHE_NAME hochzählen (z.B. "v2"), wenn du Dateien geändert hast und
// willst, dass installierte Nutzer die neue Version bekommen.
// ============================================================================

const CACHE_NAME = "veeno-v33";

const APP_SHELL_DATEIEN = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

// Beim Installieren: alle App-Dateien einmal in den Cache laden.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_DATEIEN))
  );
  self.skipWaiting();
});

// Beim Aktivieren: alte Cache-Versionen aufräumen.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((namen) =>
      Promise.all(
        namen
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// Bei jeder Anfrage: erst im Cache nachschauen, sonst aus dem Netz laden.
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((treffer) => treffer || fetch(event.request))
  );
});
