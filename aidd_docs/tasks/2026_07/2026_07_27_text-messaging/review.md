# Review: Send/receive E2E encrypted text messages (1:1)

- **Verdict**: approve
- **Diff**: `feat/identity-creation...feat/text-messaging`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_07_27
- **Findings**: 0 critical, 0 warning, 0 minor

## Phases

### Phase 1 — Server: authenticated messaging API

- [x] Migration runs cleanly; no delivered/read status columns — `server/migrations/0003_create_messages.sql`
- [x] Valid signature succeeds; tampered signature or stale timestamp returns 401 — `server/tests/messages.rs`, 3 tests pass
- [x] Bundle fetch returns identity + signed prekey + kyber prekey + at most one one-time prekey; never returns the same one-time prekey twice — `server/tests/messages.rs::prekey_bundle_never_hands_out_the_same_one_time_prekey_twice`
- [x] Sending then fetching returns a message exactly once; a second fetch returns nothing — `server/tests/messages.rs::sending_then_fetching_returns_the_message_exactly_once`

### Phase 2 — wasm-crypto: stateful sessions, encrypt/decrypt

- [x] A store round-trips through export/import — `wasm-crypto/session-smoketest.cjs`
- [x] Two independently generated identities establish a session and exchange a message that decrypts correctly — `wasm-crypto/session-smoketest.cjs`, 13/13 checks
- [x] A second message in the same session also works, proving the ratchet advances

### Phase 3 — Web client: chat UI

- [x] Two independent app instances exchange a text message end to end — `web/e2e-messaging.mjs`, 6/6 checks
- [x] A sent message's status updates automatically via polling, no manual refresh
- [x] Reload preserves the session (no re-establishing X3DH) and message history

## Findings

None.

## Verification

| Metric        | Value                                             |
| ------------- | ------------------------------------------------- |
| Verified      | 100% (10/10 acceptance criteria across 3 phases)   |
| Files checked | `server/src/auth.rs`, `server/src/routes/messages.rs`, `server/src/routes/prekey_bundle.rs`, `wasm-crypto/src/session.rs`, `web/src/chat/conversation.ts`, `web/src/api/*.ts`, `web/src/screens/Conversation.tsx`, `web/src/App.tsx` |
| Unchecked     | none |
| Unplanned     | `web/src/storage/keyStore.ts` reshaped to persist `accountId` alongside identity; account ID display added to the Safety Number screen (both needed for issue #2, neither needed by issue #1) |

### Fix pass notes

Applied all 5 findings from the previous review:
- `conversation.ts`'s `poll()` silently dropped (and, since fetch is destructive, permanently lost) messages from any sender but the open conversation partner — now logs a warning and carries a `ponytail:` comment naming the limitation and the upgrade path (server-side per-sender fetch, or a contacts list keeping every poll loop alive).
- Base64 encode/decode was duplicated across **four** call sites, not three as first counted (`register.ts`, `messages.ts`, `prekeyBundle.ts`, and `signedRequest.ts`, found while fixing) — consolidated into `web/src/api/codec.ts`.
- `Conversation.tsx` now accepts and renders an `error` prop; `App.tsx` wires it through and clears it at the start of `handleSend`, matching the existing pattern on `CreateAccount`/`NewConversation`.
- `server/src/auth.rs`: a database error while looking up an account's identity key now returns 500, not 401 — 401 is reserved for a genuinely unknown account.
- `wasm-crypto/src/session.rs`: the `Timestamp::from_epoch_millis(0)` placeholder now carries a comment explaining it's deliberate and naming when it would need a real value.

Re-verified after fixes: server tests (9/9), wasm-crypto smoke tests (10/10 identity, 13/13 session), web e2e tests (8/8 identity, 6/6 messaging) — all still pass, no regressions.
