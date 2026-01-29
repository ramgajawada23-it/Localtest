const CACHE_NAME = "offline-form-v6";

const FILES = [
  "./",
  "./login.html",
  "./index.html",
  "./styles.css",
  "./login.js",
  "./form.js",
  "./offline-db.js",
  "./signature.png",
  "./BG1.jpg",
  "./BG2.jpg",
  "./BG3.jpg",
  "./BG4.1.jpg",
  "./logo.png",
  "./sideimg.jpg",
  "./sideimg1.jpg"
];

/* ================= INSTALL ================= */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(FILES))
      .catch(err => console.error("Cache install failed", err))
  );
  self.skipWaiting();
});

/* ================= ACTIVATE ================= */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(k => k !== CACHE_NAME && caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* ================= FETCH ================= */
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(res => res || fetch(event.request))
      .catch(() => caches.match("./index.html"))
  );
});

/* ================= BACKGROUND SYNC ================= */
self.addEventListener("sync", event => {
  if (event.tag === "sync-offline-forms") {
    event.waitUntil(syncForms());
  }
});

async function syncForms() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("candidateDB", 1);

    req.onerror = reject;

    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("submissions", "readwrite");
      const store = tx.objectStore("submissions");

      const getAll = store.getAll();
      getAll.onsuccess = async () => {
        for (const record of getAll.result) {
          await fetch("/api/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(record)
          });
        }
        store.clear();
        resolve();
      };
    };
  });
}