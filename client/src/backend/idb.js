// Pembungkus IndexedDB minimal (Promise).
const DB_NAME = 'webm-editor';
const DB_VERSION = 1;
let dbp = null;

export function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('assets')) d.createObjectStore('assets', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(store) {
  const d = await db();
  return wrap(d.transaction(store).objectStore(store).getAll());
}

export async function get(store, key) {
  const d = await db();
  return wrap(d.transaction(store).objectStore(store).get(key));
}

export async function put(store, value, key) {
  const d = await db();
  const tx = d.transaction(store, 'readwrite');
  const r = key === undefined ? tx.objectStore(store).put(value) : tx.objectStore(store).put(value, key);
  await wrap(r);
  return value;
}

export async function del(store, key) {
  const d = await db();
  return wrap(d.transaction(store, 'readwrite').objectStore(store).delete(key));
}
