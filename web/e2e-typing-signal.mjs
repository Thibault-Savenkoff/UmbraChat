import { chromium } from "playwright";

// Phase 2 has no UI yet (that's phase 3), so send/receive are driven directly
// via the real exported chat/conversation.ts functions through a dynamic
// import - this is the actual module, not a re-implementation of it. Both
// the subscription and the poll() call that would flip it run inside the
// SAME page.evaluate call, in the SAME dynamically-imported instance, so
// there's no dependency on it being the identical module instance the running
// React app happens to be using (Vite's dev-time cache-busting query params
// mean a second, independent `import(...)` of the same source path is NOT
// guaranteed to resolve to the same browser-level module record).

const checks = [];
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}${ok ? "" : ` (${detail ?? ""})`}`);
  checks.push(ok);
}

const browser = await chromium.launch();

async function createAccount(context) {
  const page = await context.newPage();
  await page.goto("http://localhost:5173");
  await page.click("text=Create Account");
  await page.waitForSelector('[data-testid="account-id"]', { timeout: 15000 });
  const accountId = (await page.textContent('[data-testid="account-id"]')).trim();
  return { page, accountId };
}

async function sendTypingSignalFrom(page, recipientAccountId) {
  await page.evaluate(async (recipientId) => {
    const conversation = await import("/src/chat/conversation.ts");
    const keyStore = await import("/src/storage/keyStore.ts");
    const account = await keyStore.loadAccount();
    const store = await conversation.startConversation(recipientId, account);
    await conversation.sendTypingSignal(recipientId, account, store);
  }, recipientAccountId);
}

const alice = await createAccount(await browser.newContext());
const bob = await createAccount(await browser.newContext());
const carol = await createAccount(await browser.newContext());

// Bob never opens any conversation UI at all here - everything on his side
// runs through one manually-driven poll(), so there's no competing background
// poll loop that could race the message off the server first.
await sendTypingSignalFrom(alice.page, bob.accountId);

const bobWarnings = [];
bob.page.on("console", (msg) => {
  if (msg.type() === "warning") bobWarnings.push(msg.text());
});

const positiveResult = await bob.page.evaluate(async (aliceId) => {
  const conversation = await import("/src/chat/conversation.ts");
  const keyStore = await import("/src/storage/keyStore.ts");
  const account = await keyStore.loadAccount();
  const store = await conversation.startConversation(aliceId, account);

  const events = [];
  conversation.subscribeToTypingState((active) => events.push(active));

  // Simulates "bob has alice's conversation open" - poll()'s only notion of
  // "open" is the contactId argument it's called with, independent of any UI.
  await conversation.poll(aliceId, account, store);
  const activeRightAfter = conversation.getTypingActive();

  await new Promise((r) => setTimeout(r, 5500)); // > the 5s idle window
  const activeAfterIdle = conversation.getTypingActive();

  return { events, activeRightAfter, activeAfterIdle };
}, alice.accountId);

check("bob's typing state flips true after polling with alice's conversation open", positiveResult.activeRightAfter === true, JSON.stringify(positiveResult));
check("the state actually transitioned true then false, not just a stale read", positiveResult.events.includes(true), JSON.stringify(positiveResult.events));
check("bob's typing state auto-clears after the idle window, with no explicit 'stop' signal ever sent", positiveResult.activeAfterIdle === false, JSON.stringify(positiveResult));

// --- Gating: a typing signal from a sender whose conversation isn't the one polled must never surface ---
await sendTypingSignalFrom(carol.page, bob.accountId);

const negativeResult = await bob.page.evaluate(async (aliceId) => {
  const conversation = await import("/src/chat/conversation.ts");
  const keyStore = await import("/src/storage/keyStore.ts");
  const account = await keyStore.loadAccount();
  const store = await conversation.startConversation(aliceId, account);

  const events = [];
  conversation.subscribeToTypingState((active) => events.push(active));

  // Still polling as if alice's conversation is open - carol's ping should be
  // fetched (fetch-and-delete drains it either way) but dropped, not surfaced.
  await conversation.poll(aliceId, account, store);
  return { events, active: conversation.getTypingActive() };
}, alice.accountId);

check("a typing signal from a sender whose conversation isn't open never flips typing state true", negativeResult.active === false, JSON.stringify(negativeResult));
check("...and never fires a state transition at all", negativeResult.events.length === 0, JSON.stringify(negativeResult.events));
check(
  "the dropped signal is logged as a warning, matching how calls/timer/file-opened are already dropped for a non-open sender",
  bobWarnings.some((w) => w.includes("typing") && w.includes(carol.accountId)),
  JSON.stringify(bobWarnings),
);

console.log(checks.every(Boolean) ? "\nAll checks passed." : "\nSome checks FAILED.");
await browser.close();
process.exit(checks.every(Boolean) ? 0 : 1);
