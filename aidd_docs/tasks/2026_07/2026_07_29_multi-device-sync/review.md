# Review: Multi-device sync

- **Verdict**: approve
- **Diff**: `main...feat/multi-device-sync`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_07_29
- **Findings**: 0 critical, 1 warning (fixed), 1 minor (fixed)

## Phases

### Phase 1 — Server: device-scoped schema and auth

- [x] The migration applies cleanly to the existing dev database with test data intact — applied directly against the live DB, verified schema matches the design before any Rust code changed
- [x] A request signed with one device's key but claiming another device's `X-Device-Id` is rejected — `authenticated_request_signed_by_one_device_but_claiming_another_is_rejected`
- [x] Registering returns distinct `account_id` and `device_id` — `register_with_valid_bundle_returns_201`'s new assertion
- [x] Fetching a message returns both `sender_device_id` and `sender_account_id` — `sending_then_fetching_returns_the_message_exactly_once`

### Phase 2 — Server: device link/list/unlink endpoints

- [x] A valid code lets `complete_link` create a device under the same account — `a_valid_code_links_a_new_device_that_can_immediately_authenticate`
- [x] An expired code is rejected, no device created — `an_expired_code_is_rejected_and_creates_no_device`
- [x] A newly linked device authenticates and fetches its own bundle immediately
- [x] `list_devices` returns both devices, callable cross-account — `list_devices_shows_both_and_is_callable_by_any_account`
- [x] Unlinking revokes auth immediately — `unlinking_a_device_immediately_revokes_its_auth`
- [x] Cross-account unlink and link-init are both forbidden — two dedicated tests

### Phase 3 — Web: per-device sessions and fan-out send/receive

- [x] A message reaches every device of a two-device account — verified with real isolated browser contexts per "device" (not shared IndexedDB), not mocked
- [x] A device linked mid-conversation is picked up by the very next send with no client restart — explicitly tested with a before/after-linking message pair
- [x] Delivered/read receipts fan out identically — same `sendToContact` code path as text, not a separate implementation to verify twice

### Phase 4 — Web: linked-devices screen, pairing flow

- [x] Device B links using device A's account ID and a pairing code, ends up identity-ready under the same account
- [x] Device A's list shows both after linking, one after unlinking

## Findings

| Sev | Kind | Phase | Location | Issue | Fix |
| --- | ---- | ----- | -------- | ----- | --- |
| warning | functional | 3 | `web/src/chat/conversation.ts::sendToContact` | `list_devices` returns an empty array rather than 404ing for an unknown account (by design - see phase 2's cross-account visibility decision). Before this fix, an empty device list meant `sendToContact`'s loop ran zero times and returned successfully - a message to a nonexistent or fully-unlinked contact silently vanished with no error, a real regression from the old single-device flow (which validated the contact existed via a 404 before any message could be typed) | Throw when `devices.length === 0`; added a dedicated e2e check sending to a random UUID and asserting the error surfaces |
| minor | functional | 4 | `web/src/screens/LinkedDevices.tsx` | The device list only fetched once on mount, with no way to learn a device was linked from elsewhere - device A's list never updated after device B completed linking, since nothing on A's side triggers a re-fetch | Added periodic refresh (3s interval), matching the same eventual-consistency-via-polling approach the message pipe already uses. Caught by the e2e test itself timing out waiting for the list to update |

Considered and not a bug: `messages.sender_device_id`'s `ON DELETE CASCADE` (unlinking a device also deletes any of its messages still queued in others' inboxes, not just messages queued for it). This looked like a candidate data-loss bug at first glance, but a message is fundamentally tied to its sender device's session material (identity key, prekeys) - once that device is removed, its identity/prekeys are gone too, so a surviving message row would be permanently undecryptable garbage regardless. Cascading it away is the consistent outcome, not a bug to fix.

## Verification

| Metric        | Value                                             |
| ------------- | -------------------------------------------------- |
| Verified      | 100% (18/18 acceptance criteria across all 4 phases) |
| Files checked | `server/migrations/0004_create_devices.sql`, `server/migrations/0005_create_pending_device_links.sql`, `server/src/auth.rs`, `server/src/routes/{register,prekey_bundle,messages,devices,mod}.rs`, `server/tests/{common/mod,messages,register,devices}.rs`, `web/src/chat/conversation.ts`, `web/src/crypto/session.ts`, `web/src/api/{codec,register,signedRequest,prekeyBundle,messages,devices}.ts`, `web/src/storage/keyStore.ts`, `web/src/screens/{CreateAccount,LinkedDevices}.tsx`, `web/src/App.tsx`, `web/e2e-smoketest.mjs`, `web/e2e-multi-device-sync.mjs` |
| Unchecked     | none |
| Unplanned     | none |
