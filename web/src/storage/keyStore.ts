import type { IdentityBundle } from "../crypto/identity";

const DB_NAME = "umbrachat";
const STORE_NAME = "identity";
const RECORD_KEY = "self";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadIdentity(): Promise<IdentityBundle | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(RECORD_KEY);
    request.onsuccess = () => resolve(request.result as IdentityBundle | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function saveIdentity(identity: IdentityBundle): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(identity, RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
