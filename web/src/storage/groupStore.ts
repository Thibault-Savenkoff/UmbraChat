import { encryptForStorage, decryptFromStorage } from "../crypto/vault";

const DB_NAME = "umbrachat-groups";
const STORE_NAME = "groups";

export interface Group {
  id: string;
  name: string;
  /** The FULL membership, including the local account - deliberately not
   * member-relative, since the same envelope value is stored as-is by every
   * recipient (see chat/group.ts). Callers filter themselves out at fan-out
   * time, never in what's stored. */
  memberAccountIds: string[];
  createdAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (event.oldVersion < 1) {
        // Fresh install - go straight to the target (out-of-band key) schema,
        // no keyPath ever existed to migrate away from.
        db.createObjectStore(STORE_NAME);
        return;
      }
      if (event.oldVersion < 2) {
        // Switching from an in-line keyPath to an out-of-band key: encrypting
        // a group record would hide its own `id` field too, but IndexedDB
        // needs a keyPath store's key readable in plaintext to index it -
        // can't have both. Read every existing (plaintext, pre-encryption)
        // record out under the old store before replacing it.
        const oldStore = request.transaction!.objectStore(STORE_NAME);
        const existing: Group[] = [];
        const cursorRequest = oldStore.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (cursor) {
            existing.push(cursor.value as Group);
            cursor.continue();
          } else {
            db.deleteObjectStore(STORE_NAME);
            const newStore = db.createObjectStore(STORE_NAME);
            for (const group of existing) newStore.put(group, group.id);
          }
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadGroup(groupId: string): Promise<Group | undefined> {
  const db = await openDb();
  const raw = await new Promise<unknown>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(groupId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return decryptFromStorage<Group>(raw);
}

export async function saveGroup(group: Group): Promise<void> {
  const db = await openDb();
  const stored = await encryptForStorage(group);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(stored, group.id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadAllGroups(): Promise<Group[]> {
  const db = await openDb();
  const rawList = await new Promise<unknown[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as unknown[]);
    request.onerror = () => reject(request.error);
  });
  const groups = await Promise.all(rawList.map((raw) => decryptFromStorage<Group>(raw)));
  return groups.filter((g): g is Group => g !== undefined);
}
