const DB_NAME = "umbrachat-push-prefs";
const STORE_NAME = "prefs";
const RECORD_KEY = "displayLevel";
const TYPING_INDICATOR_KEY = "typingIndicatorEnabled";

export type PushDisplayLevel = "generic" | "silent";

// Deliberately NOT routed through crypto/vault.ts's encrypt/decrypt-for-
// storage helpers, unlike every other store - the Service Worker (public/sw.js)
// has to read this value too, and it has no access whatsoever to the vault's
// in-memory key, which only ever exists in the main page's own JS context.
// Encrypting this would make it unreadable from the Service Worker the moment
// local encryption is enabled. Not sensitive data anyway - just a display
// preference, nothing worth protecting at rest.

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

export async function loadPushDisplayLevel(): Promise<PushDisplayLevel> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(RECORD_KEY);
    request.onsuccess = () => resolve((request.result as PushDisplayLevel | undefined) ?? "generic");
    request.onerror = () => reject(request.error);
  });
}

export async function savePushDisplayLevel(level: PushDisplayLevel): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(level, RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ponytail: reuses this same small "prefs" store as a second key rather than
// a whole new database, for one more boolean - same non-sensitive, opt-in-UI-
// preference category as the display level above.

export async function loadTypingIndicatorEnabled(): Promise<boolean> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(TYPING_INDICATOR_KEY);
    request.onsuccess = () => resolve((request.result as boolean | undefined) ?? false);
    request.onerror = () => reject(request.error);
  });
}

export async function saveTypingIndicatorEnabled(enabled: boolean): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(enabled, TYPING_INDICATOR_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
