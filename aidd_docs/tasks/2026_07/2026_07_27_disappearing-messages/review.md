# Review: Disappearing messages

- **Verdict**: approve
- **Diff**: `main...feat/disappearing-messages`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_07_27
- **Findings**: 0 critical, 0 warning, 2 minor (both fixed)

## Phases

### Phase 1 — Timer envelope, per-message expiry, hard delete

- [x] Setting a timer on one side updates the other participant's stored setting after their next poll — `web/e2e-disappearing-messages.mjs`, "bob's timer picker syncs..."
- [x] A sent message's `expiresAt` is only set once the read receipt arrives, not at send time — `chat/conversation.ts` poll's receipt branch; verified by the e2e test waiting a poll tick before force-expiring
- [x] A received message gets `expiresAt` set immediately — `chat/conversation.ts` poll's text branch
- [x] Changing the timer after a message already has `timerSeconds`/`expiresAt` does not alter it — `expiresAt` is computed exactly once and never revisited; the e2e test's "permanent message" (sent before any timer) proves the no-timer case survives the whole run untouched
- [x] An expired message is hard-deleted from IndexedDB on the next poll, not hidden — `chat/conversation.ts::poll`'s sweep filters and re-saves `alive`, not a display-layer filter; verified via direct IndexedDB inspection in the e2e test

### Phase 2 — Web: timer picker, expiry indicator

- [x] The other participant's picker reflects a changed timer after their next poll — same e2e check as above (tested with 30s instead of the plan's illustrative "5m", to keep the test fast; the mechanism being verified — sync of an arbitrary duration — is identical)
- [x] A message sent after the timer is set carries it; one sent before does not — e2e "permanent message" vs "will vanish"
- [x] A message with an active timer shows the disappearing marker; one without does not — e2e marker-count checks on both sides

## Findings

| Sev | Kind | Phase | Location | Issue | Fix |
| --- | ---- | ----- | -------- | ----- | --- |
| minor | code | 2 | `web/src/screens/Conversation.tsx` timer `<select>` | No `aria-label`, unlike the file input in the same component which has one | Added `aria-label="Disappearing message timer"` |
| minor | code | 2 | `web/src/screens/Conversation.tsx` timer `<select>` | Missing `disabled={sending}`, inconsistent with the text and file inputs right next to it (no correctness bug - `store.encrypt` calls are synchronous and never interleave - just a UX inconsistency) | Added `disabled={sending}` |

## Verification

| Metric        | Value                                             |
| ------------- | -------------------------------------------------- |
| Verified      | 100% (8/8 acceptance criteria)                     |
| Files checked | `web/src/chat/conversation.ts`, `web/src/storage/messageStore.ts`, `web/src/App.tsx`, `web/src/screens/Conversation.tsx`, `web/e2e-disappearing-messages.mjs` |
| Unchecked     | none |
| Unplanned     | none |
