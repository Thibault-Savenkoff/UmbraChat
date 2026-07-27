# Review: Offline message queue, synced on reconnect

- **Verdict**: approve
- **Diff**: `feat/text-messaging...feat/offline-sync`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_07_27
- **Findings**: 0 critical, 0 warning, 0 minor

## Phases

### Phase 1 — Ordered, immediate delivery on reconnect

- [x] Sending 3 messages in immediate succession, then fetching once reconnected, returns them in send order — `server/tests/messages.rs::fetching_multiple_queued_messages_returns_them_in_send_order`
- [x] Opening a conversation with pending messages shows them without waiting for a poll interval to elapse — `web/e2e-offline-sync.mjs`, elapsed time asserted well under the 3s interval

## Findings

None. Small, well-scoped fix: no new dependency, no new server-side state, matches the existing zero-knowledge/minimal-retention design. The one implementation risk (Postgres `DELETE` doesn't support `ORDER BY`) was caught by verifying against a real instance before writing the fix, not assumed.

## Verification

| Metric        | Value                                             |
| ------------- | ------------------------------------------------- |
| Verified      | 100% (2/2 acceptance criteria)                     |
| Files checked | `server/src/routes/messages.rs`, `server/tests/messages.rs`, `web/src/App.tsx`, `web/e2e-offline-sync.mjs` |
| Unchecked     | none |
| Unplanned     | none |
