import { chromium } from "playwright";

const checks = [];
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}${ok ? "" : ` (${detail ?? ""})`}`);
  checks.push(ok);
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
await page.goto("http://localhost:5173");

// --- Registration ---
const ready = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  return !!reg.active;
});
check("the Service Worker registers and becomes active", ready);

// --- pushPrefsStore round trip (from the page context, same IndexedDB the SW reads) ---
const defaultLevel = await page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open("umbrachat-push-prefs", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("prefs");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const value = await new Promise((resolve, reject) => {
    const r = db.transaction("prefs", "readonly").objectStore("prefs").get("displayLevel");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return value;
});
check("with nothing saved yet, the preference is undefined at the raw IndexedDB level (store defaults to 'generic' in application code, not storage)", defaultLevel === undefined, defaultLevel);

async function setDisplayLevel(level) {
  await page.evaluate(async (lvl) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open("umbrachat-push-prefs", 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("prefs", "readwrite");
      tx.objectStore("prefs").put(lvl, "displayLevel");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }, level);
}

// --- Simulate a real push event inside the Service Worker's own execution context ---
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));

async function simulatePushAndCheck(level, expectedTitle, expectedBody) {
  await setDisplayLevel(level);
  await worker.evaluate(async () => {
    // Stub showNotification so this test doesn't need OS-level notification
    // permission - just captures what the handler would have shown.
    self.__lastNotification = null;
    self.registration.showNotification = (title, options) => {
      self.__lastNotification = { title, body: options && options.body };
      return Promise.resolve();
    };
  });
  await worker.evaluate(async () => {
    const event = new ExtendableEvent("push");
    self.dispatchEvent(event);
    // The handler's own waitUntil promise isn't observable from here directly -
    // give its async IndexedDB read a moment to resolve and call showNotification.
    await new Promise((r) => setTimeout(r, 300));
  });
  const result = await worker.evaluate(() => self.__lastNotification);
  check(`push event with '${level}' preference shows the right notification`, result && result.title === expectedTitle && result.body === expectedBody, JSON.stringify(result));
}

await simulatePushAndCheck("generic", "UmbraChat", "New message");
await simulatePushAndCheck("silent", "UmbraChat", undefined);

await browser.close();
const failed = checks.some((c) => !c);
process.exit(failed ? 1 : 0);
