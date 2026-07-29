const DB_NAME = "umbrachat-groups";
const STORE_NAME = "groups";

export interface Group {
  id: string;
  name: string;
  /** Other members - excludes the local account, same convention `contactId` already uses for 1:1. */
  memberAccountIds: string[];
  createdAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadGroup(groupId: string): Promise<Group | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(groupId);
    request.onsuccess = () => resolve(request.result as Group | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function saveGroup(group: Group): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(group);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadAllGroups(): Promise<Group[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as Group[]);
    request.onerror = () => reject(request.error);
  });
}
