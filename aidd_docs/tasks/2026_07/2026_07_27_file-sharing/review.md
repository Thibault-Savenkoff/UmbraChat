# Review: Send/receive E2E encrypted files

- **Verdict**: approve
- **Diff**: `feat/offline-sync...feat/file-sharing`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_07_27
- **Findings**: 0 critical, 0 warning, 0 minor

## Phases

### Phase 1 — Server: raise the request body size limit

- [x] A ~10MB body succeeds, previously rejected at 1MB — `server/tests/messages.rs::a_large_body_within_the_limit_succeeds_and_over_the_limit_is_rejected` (7MB raw/~9.3MB encoded, CREATED)
- [x] A body over 12MB is still rejected — same test, 10MB raw/~13.3MB encoded, asserts `is_client_error()`

### Phase 2 — Web: file picker, encrypted send/receive, progress

- [x] Sending a file is decrypted and downloadable on the other side, byte-for-byte identical — `web/e2e-file-sharing.mjs`, 4096-byte non-UTF8 buffer compared post-round-trip
- [x] Picking a file over 8MB shows a clear error immediately, no request sent — `web/e2e-file-sharing.mjs`, 9MB buffer, asserts `role="alert"` and unchanged message count
- [x] Sender sees stage progress, not a static label — `chat/conversation.ts::sendFile` reports `encrypting → sending → sent` via `onStage`, rendered at `screens/Conversation.tsx:94`

## Findings

None. Files reuse the existing message pipe exactly as planned: new envelope type, no new server table or endpoint, no new crypto. The one real bug found during implementation (React StrictMode double-invoking the blob-URL revoke effect and permanently breaking downloads) was caught by running the e2e test and reading the actual failure, not assumed, and fixed by dropping the revoke with a ponytail comment explaining why revoke-on-cleanup + `useMemo` isn't StrictMode-safe here. The client-side 8MB cap is UX only, not a security boundary — the server's 12MB body limit is the actual resource backstop, consistent with the server already having no way to distinguish file envelopes from any other opaque ciphertext.

## Verification

| Metric        | Value                                             |
| ------------- | -------------------------------------------------- |
| Verified      | 100% (5/5 acceptance criteria)                     |
| Files checked | `server/src/auth.rs`, `server/tests/messages.rs`, `web/src/chat/conversation.ts`, `web/src/screens/Conversation.tsx`, `web/src/storage/messageStore.ts`, `web/src/App.tsx`, `web/e2e-file-sharing.mjs` |
| Unchecked     | none |
| Unplanned     | none |
