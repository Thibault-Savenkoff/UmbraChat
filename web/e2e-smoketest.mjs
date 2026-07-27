import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(String(err)));

await page.goto("http://localhost:5173");
await page.waitForSelector("button");

const checks = [];

checks.push(["no console errors after initial load", consoleErrors.length === 0, consoleErrors.join("; ")]);

await page.click("button");
try {
  await page.waitForSelector('[data-testid="safety-number"]', { timeout: 15000 });
} catch (e) {
  console.log("DEBUG console errors:", consoleErrors);
  console.log("DEBUG body html:", await page.content());
  throw e;
}

const safetyNumber = await page.textContent('[data-testid="safety-number"]');
checks.push(["safety number is non-empty", !!safetyNumber && safetyNumber.trim().length > 0, safetyNumber]);

await page.reload();
await page.waitForSelector('[data-testid="safety-number"]', { timeout: 15000 });
const safetyNumberAfterReload = await page.textContent('[data-testid="safety-number"]');
checks.push([
  "reload reuses the same identity (same safety number)",
  safetyNumberAfterReload === safetyNumber,
  `before=${safetyNumber} after=${safetyNumberAfterReload}`,
]);

checks.push(["still no console errors after reload", consoleErrors.length === 0, consoleErrors.join("; ")]);

let failed = false;
for (const [label, ok, detail] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}${ok ? "" : ` (${detail})`}`);
  if (!ok) failed = true;
}

await browser.close();
process.exit(failed ? 1 : 0);
