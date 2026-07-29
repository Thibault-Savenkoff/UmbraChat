# Review: Self-destructing files

- **Verdict**: approve
- **Diff**: `main...feat/self-destructing-files`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_07_29
- **Findings**: 0 critical, 0 warning, 1 minor (fixed)

## Phases

### Phase 1 — Destruct envelope, timed expiry, open-triggered deletion

- [x] A timed file is gone from both devices shortly after expiry, whether or not it was opened — `web/e2e-self-destructing-files.mjs`, forced-expiry check
- [x] Opening an on-open file removes it from the receiver's storage immediately — same suite, no poll wait needed
- [x] Opening any self-destructing file updates the sender's copy to `status: "opened"` — same suite
- [x] A file with no destruct mode is unaffected — same suite, "permanent.bin" survives the whole run

### Phase 2 — Web: destruct-mode picker, open-triggers-delete, status visibility

- [x] "Delete after opening": 🔥 marker on both sides, gone from the recipient's list on click, sender sees `(opened)`
- [x] Timed: gone from both sides after expiry regardless of open status
- [x] "None": no marker, unaffected

## Findings

| Sev | Kind | Phase | Location | Issue | Fix |
| --- | ---- | ----- | -------- | ----- | --- |
| minor | code | 2 | `web/src/screens/Conversation.tsx::handleFilePick` | The destruct-mode `<select>` didn't reset after sending, so a user picking "Delete after opening" once would silently mark every subsequent file the same way - contradicts the plan's own decision that this is a per-file opt-in, not a standing policy (unlike the conversation-wide disappearing-message timer, which *is* meant to persist) | Reset to `"none"` after each send; added a test asserting the picker's value resets |

## Verification

| Metric        | Value                                             |
| ------------- | -------------------------------------------------- |
| Verified      | 100% (8/8 acceptance criteria across both phases)  |
| Files checked | `web/src/chat/conversation.ts`, `web/src/storage/messageStore.ts`, `web/src/screens/Conversation.tsx`, `web/src/App.tsx`, `web/e2e-self-destructing-files.mjs` |
| Unchecked     | none |
| Unplanned     | none |
