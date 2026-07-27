# Review: Send/receive E2E encrypted text messages (1:1)

- **Verdict**: changes-requested
- **Diff**: `feat/identity-creation...feat/text-messaging`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_07_27
- **Findings**: 0 critical, 3 warning, 2 minor

## Phases

### Phase 1 — Server: authenticated messaging API

- [x] Migration runs cleanly; no delivered/read status columns — `server/migrations/0003_create_messages.sql`
- [x] Valid signature succeeds; tampered signature or stale timestamp returns 401 — `server/tests/messages.rs`, 3 tests pass
- [x] Bundle fetch returns identity + signed prekey + kyber prekey + at most one one-time prekey; never returns the same one-time prekey twice — `server/tests/messages.rs::prekey_bundle_never_hands_out_the_same_one_time_prekey_twice`
- [x] Sending then fetching returns a message exactly once; a second fetch returns nothing — `server/tests/messages.rs::sending_then_fetching_returns_the_message_exactly_once`

### Phase 2 — wasm-crypto: stateful sessions, encrypt/decrypt

- [x] A store round-trips through export/import — `wasm-crypto/session-smoketest.cjs`
- [x] Two independently generated identities establish a session and exchange a message that decrypts correctly — `wasm-crypto/session-smoketest.cjs`, 13/13 checks
- [x] A second message in the same session also works, proving the ratchet advances (verified against real protocol semantics: type byte 3→2 only after each side decrypts something back, not assumed)

### Phase 3 — Web client: chat UI

- [x] Two independent app instances exchange a text message end to end — `web/e2e-messaging.mjs`, real two-browser-context test against the live server, 6/6 checks
- [x] A sent message's status updates automatically via polling, no manual refresh (reaches "read"; "delivered" is folded into the same round-trip per a documented simplification — see Phase 3 gotcha)
- [x] Reload preserves the session (no re-establishing X3DH) and message history — verified both in the e2e test and directly in `session-smoketest.cjs`

## Findings

| Sev | Kind | Phase | Location | Issue | Fix |
| --- | ---- | ----- | -------- | ----- | --- |
| 🟡 | code | 3 | `web/src/chat/conversation.ts` (`poll`) | `GET /v1/messages` is fetch-**and-delete** server-side, but `poll()` only processes messages from the currently-open conversation partner (`if (message.senderAccountId !== contactId) continue`) — a message from any other sender is deleted from the server and then silently discarded client-side. Permanent, silent data loss the moment a second contact is involved, and nothing marks this as a known limitation | Either avoid destroying messages you're about to discard (needs server-side per-sender filtering, a bigger change) or at minimum add a `ponytail:` comment documenting this as a single-conversation-MVP limitation so it's tracked instead of silently lost |
| 🟡 | rot | 3 | `web/src/api/register.ts`, `messages.ts`, `prekeyBundle.ts` | Base64 encode/decode helpers (`toBase64`/`fromBase64`) are duplicated across three files with slightly inconsistent types (`number[]` vs `Uint8Array`) instead of one shared utility | Extract to a single `api/codec.ts`, use consistent types |
| 🟡 | code | 3 | `web/src/screens/Conversation.tsx`, `App.tsx` | `handleSend`'s catch sets `error` state, but `Conversation` never accepts or renders an `error` prop — a failed send is invisible to the user (visible only in devtools) | Add an `error` prop/display to `Conversation.tsx`, matching `CreateAccount`/`NewConversation`'s existing pattern |
| 🟢 | code | 1 | `server/src/auth.rs` (`verify`) | A database error while looking up an account's identity key is reported as 401 (`unauthorized("unknown account")`), conflating "account doesn't exist" with "the DB call failed" | Return a 500 for the DB-error branch, keep 401 only for a genuinely missing account |
| 🟢 | code | 2 | `wasm-crypto/src/session.rs` (`SignalStore::new`) | `Timestamp::from_epoch_millis(0)` placeholder used when reconstructing prekey records has no comment explaining it's deliberate (the real registration timestamp isn't tracked client-side) | Add a short comment noting this and that it would matter once prekey rotation/expiry policy exists |

## Verification

| Metric        | Value                                             |
| ------------- | ------------------------------------------------- |
| Verified      | 100% (10/10 acceptance criteria across 3 phases)   |
| Files checked | `server/src/auth.rs`, `server/src/routes/messages.rs`, `server/src/routes/prekey_bundle.rs`, `server/tests/messages.rs`, `wasm-crypto/src/session.rs`, `wasm-crypto/session-smoketest.cjs`, `web/src/chat/conversation.ts`, `web/src/crypto/session.ts`, `web/src/api/*.ts`, `web/src/App.tsx`, `web/e2e-messaging.mjs` |
| Unchecked     | none |
| Unplanned     | `web/src/storage/keyStore.ts` reshaped to persist `accountId` alongside identity (was silently discarded after registration — issue #1 never needed it, issue #2 does to sign requests); account ID display added to the Safety Number screen (needed so a user can share it to be messaged) |
