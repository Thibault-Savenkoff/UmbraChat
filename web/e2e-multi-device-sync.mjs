import { chromium } from "playwright";

const checks = [];
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}${ok ? "" : ` (${detail ?? ""})`}`);
  checks.push(ok);
}

const browser = await chromium.launch();

async function newPage() {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("http://localhost:5173");
  return page;
}

const deviceA = await newPage();
const deviceB = await newPage();

// Device A: create a fresh account.
await deviceA.click("text=Create Account");
await deviceA.waitForSelector('[data-testid="account-id"]', { timeout: 15000 });
const accountId = (await deviceA.textContent('[data-testid="account-id"]')).trim();

// Device A: request a pairing code.
await deviceA.click("text=Link a New Device");
await deviceA.waitForSelector('[data-testid="link-code"]', { timeout: 15000 });
const code = (await deviceA.textContent('[data-testid="link-code"]')).trim();
check("a pairing code is issued", code.length > 0, code);

// Device B: link using device A's account id and the code.
await deviceB.fill('input[placeholder="Account ID"]', accountId);
await deviceB.fill('input[placeholder="Pairing code"]', code);
await deviceB.click("text=Link This Device");
await deviceB.waitForSelector('[data-testid="account-id"]', { timeout: 15000 });
const deviceBAccountId = (await deviceB.textContent('[data-testid="account-id"]')).trim();
check("device B ends up on the identity-ready screen under the same account", deviceBAccountId === accountId, `A=${accountId} B=${deviceBAccountId}`);

// Device A's device list shows both.
await deviceA.waitForFunction(() => document.querySelectorAll('[data-testid="device-row"]').length === 2, { timeout: 15000 });
check("device A's list shows both devices after linking", true);

// Unlink device B from device A.
const rows = deviceA.locator('[data-testid="device-row"]');
const rowCount = await rows.count();
let unlinked = false;
for (let i = 0; i < rowCount; i++) {
  const text = await rows.nth(i).textContent();
  if (!text.includes("this device")) {
    await rows.nth(i).locator("text=Unlink").click();
    unlinked = true;
    break;
  }
}
check("found and clicked Unlink on the non-primary device", unlinked);

await deviceA.waitForFunction(() => document.querySelectorAll('[data-testid="device-row"]').length === 1, { timeout: 15000 });
check("device A's list shows only one device after unlinking", true);

await browser.close();

const failed = checks.some((ok) => !ok);
process.exit(failed ? 1 : 0);
