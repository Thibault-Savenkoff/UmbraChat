---
objective: "A user can link additional devices to their account (each with its own identity and sessions, no private key ever touching the server), send/receive under that identity, see their linked devices, and unlink one to immediately cut off its access."
status: pending
---

# Plan: Multi-device sync

## Overview

| Field      | Value                   |
| ---------- | ----------------------- |
| **Goal**   | Every identity/prekey/session table becomes device-scoped instead of account-scoped; a contact's messages fan out to all of that contact's devices, reusing the exact same encrypted envelope pipe every other feature already uses |
| **Source** | GitHub issue #8 — https://github.com/Thibault-Savenkoff/UmbraChat/issues/8 |

## Phases

| #   | Phase        | File                         |
| --- | ------------ | ----------------------------- |
| 1   | Server: device-scoped schema and auth | [`phase-1.md`](./phase-1.md) |
| 2   | Server: device link/list/unlink endpoints | [`phase-2.md`](./phase-2.md) |
| 3   | Web: per-device sessions and fan-out send/receive | [`phase-3.md`](./phase-3.md) |
| 4   | Web: linked-devices screen, pairing flow | [`phase-4.md`](./phase-4.md) |

## Resources

None consulted beyond the existing codebase.

## Decisions

| Decision   | Why   |
| ---------- | ----- |
| Each linked device gets its own independent identity keypair, prekeys, and Signal sessions - no live ratchet state is ever synced between devices, and no private key is ever transferred | Real Double Ratchet state can't be safely shared between two independently-running clients without a distributed-locking problem neither this project's budget nor libsignal's API affords. This is the same approach real Signal uses: a message multicasts to every device, each device decrypts with its own independent session. Also the only way to satisfy the issue's own "without the server learning any private key" - the server never sees key material for any device, linked or primary |
| No `wasm-crypto`/Rust changes needed at all | Verified by reading `wasm-crypto/src/session.rs`: `ProtocolAddress` is built from a free-form string name plus a hardcoded `device_id: 1`. Two different devices can be modeled as two different *string* addresses (e.g. `"<accountId>:<deviceId>"`) while the underlying numeric field stays 1 for both - libsignal only needs the (name, device_id) pair to be unique per session, which the string alone already guarantees. The `// multi-device is a separate, later story` comment on that hardcoded value turns out not to block this design at all |
| Auth becomes device-scoped: `X-Account-Id` becomes `X-Device-Id`, and `identity_keys`/`signed_prekeys`/`kyber_signed_prekeys`/`prekeys` move from PK'd-on-`account_id` to PK'd-on-`device_id` (a new `devices` table, FK'd to `accounts`) | The server needs to independently identify and revoke *one* device without affecting the others - impossible if every device authenticates with the same shared credential. This is the one part of the feature that can't be done as an additive envelope type; it's a real, unavoidable auth-model change, same class of decision as the STUN/TURN call the user already confirmed for issue #9 |
| Messages fan out to every device of the *recipient* only - not also to the sender's own other devices | Real Signal mirrors sent messages to your own other devices too (so your laptop sees what you sent from your phone). That's a genuinely separate feature (the receiving device must recognize "this is my own sent message," not an incoming one) and isn't required by this issue's literal acceptance criteria ("the new device can send/receive messages under the same identity" - not "sees what my other devices sent"). Named here as a deliberate scope cut, not silently skipped - add if a future issue asks for it |
| No history sync for a newly linked device | Same reasoning already applied to disappearing messages and file sharing: each device's local IndexedDB history is independent, matching how this app already treats local storage everywhere. The issue's DoD never mentions history, only "send/receive messages" going forward |
| Listing an account's devices (`GET /v1/accounts/:id/devices`) has no ownership check - any authenticated caller, not just the account's own devices | A sender needs to discover a *contact's* device list to fan out to it; that's a different, necessarily-cross-account use case from "show me my own devices," and the two can't both be same-account-restricted. Named trade-off: a contact can see your device count/labels/link-times, a bit more metadata than real Signal exposes (only device addresses, not labels or counts). Unlinking stays same-account-restricted - only listing is open |
| Linking uses a manually-typed short pairing code instead of an actual QR code image | The issue's AC says "e.g. via QR code" - an example, not a requirement. Rendering a real QR code needs an image-generation library this project doesn't have installed; a short opaque code (displayed as text, typed into the new device) satisfies the same technical requirement - a primary device authorizing a specific new device within a short time window - without a new dependency |
| Existing single-device accounts get a `devices` row created automatically in the migration, reusing the account's own id as that device's id | Existing `identity_keys`/`signed_prekeys`/etc rows are already PK'd on `account_id`; giving the "primary" device the same UUID means those rows can be repointed via a column rename instead of a data copy |

## Existing schema (verified against the live database before writing the migration)

```
identity_keys, signed_prekeys, kyber_signed_prekeys, prekeys: all PK'd on account_id, all FK'd to accounts(id)
  constraint names: identity_keys_account_id_fkey, signed_prekeys_account_id_fkey,
                     kyber_signed_prekeys_account_id_fkey, prekeys_account_id_fkey
messages: sender_account_id, recipient_account_id, both FK'd to accounts(id)
  constraint names: messages_sender_account_id_fkey, messages_recipient_account_id_fkey
  index: messages_recipient_idx on recipient_account_id
```
