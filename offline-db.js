// ================= DB CONFIG =================
const DB_NAME = "candidateDB";
const DB_VERSION = 1;

const DRAFT_STORE = "draft";
const SUBMIT_STORE = "submissions";

const DRAFT_KEY = "formDraft";

let db = null;
let dbReady = false;
let idbDisabled = false;

// ================= OPEN DB =================
function openDB() {
  if (idbDisabled) return Promise.resolve(null);
  if (dbReady && db) return Promise.resolve(db);

  return new Promise(resolve => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = e => {
        db = e.target.result;

        if (!db.objectStoreNames.contains(DRAFT_STORE)) {
          db.createObjectStore(DRAFT_STORE);
        }

        if (!db.objectStoreNames.contains(SUBMIT_STORE)) {
          db.createObjectStore(SUBMIT_STORE, { autoIncrement: true });
        }
      };

      req.onsuccess = e => {
        db = e.target.result;
        dbReady = true;
        resolve(db);
      };

      req.onerror = () => {
        console.warn("IndexedDB not available");
        idbDisabled = true;
        resolve(null);
      };
    } catch (err) {
      console.warn("IndexedDB exception", err);
      idbDisabled = true;
      resolve(null);
    }
  });
}

// ================= DRAFT =================
async function saveDraftToDB(data) {
  const dbRef = await openDB();
  if (!dbRef) return;

  return new Promise(resolve => {
    const tx = dbRef.transaction(DRAFT_STORE, "readwrite");
    tx.objectStore(DRAFT_STORE).put(data, DRAFT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function loadDraftFromDB() {
  const dbRef = await openDB();
  if (!dbRef) return null;

  return new Promise(resolve => {
    const req = dbRef
      .transaction(DRAFT_STORE)
      .objectStore(DRAFT_STORE)
      .get(DRAFT_KEY);

    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

async function clearDraft() {
  const dbRef = await openDB();
  if (!dbRef) return;

  return new Promise(resolve => {
    const tx = dbRef.transaction(DRAFT_STORE, "readwrite");
    tx.objectStore(DRAFT_STORE).delete(DRAFT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// ================= OFFLINE SUBMISSION =================
async function saveOffline(data) {
  const dbRef = await openDB();
  if (!dbRef) return;

  return new Promise(resolve => {
    const tx = dbRef.transaction(SUBMIT_STORE, "readwrite");
    tx.objectStore(SUBMIT_STORE).add(data);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function getOfflineData() {
  const dbRef = await openDB();
  if (!dbRef) return [];

  return new Promise(resolve => {
    const req = dbRef
      .transaction(SUBMIT_STORE)
      .objectStore(SUBMIT_STORE)
      .getAll();

    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

async function clearOfflineData() {
  const dbRef = await openDB();
  if (!dbRef) return;

  return new Promise(resolve => {
    const tx = dbRef.transaction(SUBMIT_STORE, "readwrite");
    tx.objectStore(SUBMIT_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
