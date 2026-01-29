// ================= DB CONFIG =================
const DB_NAME = "candidateDB";
const SUBMIT_STORE = "submissions";
const DRAFT_STORE = "draft";
const DRAFT_KEY = "formDraft";

let db = null;
let dbReady = false;
let idbDisabled = false;

// ================= OPEN DB =================
function openDB() {
  if (idbDisabled) {
    return Promise.resolve(null);
  }

  if (dbReady && db) {
    return Promise.resolve(db);
  }

  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);

      req.onupgradeneeded = (e) => {
        db = e.target.result; // ✅ NO shadowing

        if (!db.objectStoreNames.contains(SUBMIT_STORE)) {
          db.createObjectStore(SUBMIT_STORE, { autoIncrement: true });
        }

        if (!db.objectStoreNames.contains(DRAFT_STORE)) {
          db.createObjectStore(DRAFT_STORE);
        }
      };

      req.onsuccess = (e) => {
        db = e.target.result;
        dbReady = true;
        resolve(db);
      };

      req.onerror = () => {
        console.warn("IndexedDB unavailable – disabling offline features");
        idbDisabled = true;
        resolve(null); // ✅ NEVER reject
      };

    } catch (err) {
      console.warn("IndexedDB exception – disabling offline features", err);
      idbDisabled = true;
      resolve(null);
    }
  });
}

// ================= DRAFT =================
async function saveDraft(data) {
  const dbRef = await openDB();
  if (!dbRef || idbDisabled) return;

  try {
    dbRef.transaction(DRAFT_STORE, "readwrite")
      .objectStore(DRAFT_STORE)
      .put(data, DRAFT_KEY);
  } catch {}
}

async function loadDraft() {
  const dbRef = await openDB();
  if (!dbRef || idbDisabled) return null;

  return new Promise(resolve => {
    const req = dbRef.transaction(DRAFT_STORE)
      .objectStore(DRAFT_STORE)
      .get(DRAFT_KEY);
    req.onsuccess = () => resolve(req.result || null);
  });
}

async function clearDraft() {
  const dbRef = await openDB();
  if (!dbRef || idbDisabled) return;

  try {
    dbRef.transaction(DRAFT_STORE, "readwrite")
      .objectStore(DRAFT_STORE)
      .delete(DRAFT_KEY);
  } catch {}
}

// ================= OFFLINE SUBMISSION =================
async function saveOffline(data) {
  const dbRef = await openDB();
  if (!dbRef || idbDisabled) return;

  try {
    dbRef.transaction(SUBMIT_STORE, "readwrite")
      .objectStore(SUBMIT_STORE)
      .add(data);
  } catch {}
}

async function getOfflineData() {
  const dbRef = await openDB();
  if (!dbRef || idbDisabled) return [];

  return new Promise(resolve => {
    const req = dbRef.transaction(SUBMIT_STORE)
      .objectStore(SUBMIT_STORE)
      .getAll();
    req.onsuccess = () => resolve(req.result || []);
  });
}

async function clearOfflineData() {
  const dbRef = await openDB();
  if (!dbRef || idbDisabled) return;

  try {
    dbRef.transaction(SUBMIT_STORE, "readwrite")
      .objectStore(SUBMIT_STORE)
      .clear();
  } catch {}
}