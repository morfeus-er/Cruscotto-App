/* Service worker del Cruscotto Borsa (web app).
   - Rende l'app installabile e la apre anche senza connessione.
   - L'app si aggiorna da sola: index.html viene sempre chiesto prima alla rete.
   - I dati letti dal repository privato (cartella data) vengono conservati sul dispositivo,
     così senza rete si vede l'ultima analisi scaricata.
   La riga VERSIONE viene riscritta a ogni rilascio dal programma che genera la web app. */
const VERSIONE = "d1ea93a1109e";
const CACHE_APP = "cruscotto-app-" + VERSIONE;
const CACHE_DATI = "cruscotto-dati";
const FILE_APP = ["./", "index.html", "manifest.webmanifest", "favicon.ico", "apple-touch-icon.png",
  "icona-192.png", "icona-512.png", "icona-maskable-192.png", "icona-maskable-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_APP).then((c) => c.addAll(FILE_APP)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("cruscotto-app-") && k !== CACHE_APP).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// le copie salvate portano un segno, così il cruscotto può dire che i dati non sono freschi
function segnaCopia(r) {
  const h = new Headers(r.headers);
  h.set("X-Cruscotto-Copia", "1");
  return r.blob().then((b) => new Response(b, { status: r.status, statusText: r.statusText, headers: h }));
}

// prima la rete; se non risponde, la copia salvata.
// Per i dati, un file mai scaricato vale come "non presente" (404): così i file facoltativi,
// come l'ultimo backtest, non impediscono di vedere l'ultima analisi senza rete.
function reteOCopia(req, cacheName, mancante404) {
  return fetch(req).then((res) => {
    if (res && res.ok) {
      const copia = res.clone();
      caches.open(cacheName).then((c) => c.put(req, copia));
    }
    return res;
  }).catch(() => caches.open(cacheName)
    .then((c) => c.match(req, { ignoreVary: true, ignoreSearch: req.mode === "navigate" }))
    .then((r) => r ? segnaCopia(r) : (mancante404 ? new Response("{}", { status: 404, statusText: "Senza rete" })
                                   : Promise.reject(new Error("senza rete e senza copia salvata")))));
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;                       // comandi a GitHub e Gemini: sempre in rete
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {              // file dell'app
    e.respondWith(reteOCopia(req, CACHE_APP, false));
  } else if (url.pathname.indexOf("/contents/data/") >= 0) {   // dati del cruscotto (ultima analisi, liste, portafoglio)
    e.respondWith(reteOCopia(req, CACHE_DATI, true));
  }
});
