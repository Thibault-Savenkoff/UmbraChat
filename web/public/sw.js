// Service Worker for push notifications. Plain JS, not TypeScript - this file
// is served directly, with no Vite/TS build step in front of it, so it can't
// `import` the app's own modules. Duplicates the minimal IndexedDB read
// needed for the display-level preference rather than sharing
// storage/pushPrefsStore.ts's code.

const DB_NAME = "umbrachat-push-prefs";
const STORE_NAME = "prefs";
const RECORD_KEY = "displayLevel";

function loadPushDisplayLevel() {
  return new Promise((resolve) => {
    const openReq = indexedDB.open(DB_NAME, 1);
    openReq.onupgradeneeded = () => {
      openReq.result.createObjectStore(STORE_NAME);
    };
    openReq.onsuccess = () => {
      const getReq = openReq.result.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(RECORD_KEY);
      getReq.onsuccess = () => resolve(getReq.result || "generic");
      getReq.onerror = () => resolve("generic");
    };
    openReq.onerror = () => resolve("generic");
  });
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// The push payload itself is always empty/content-free (see server's
// notify_device) - what's shown here is entirely the recipient's own locally
// stored choice, never anything the server or the sender controls.
self.addEventListener("push", (event) => {
  event.waitUntil(
    loadPushDisplayLevel().then((level) => {
      if (level === "silent") {
        return self.registration.showNotification("UmbraChat");
      }
      return self.registration.showNotification("UmbraChat", { body: "New message" });
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow("/");
    }),
  );
});
