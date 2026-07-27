---
objective: "Two users, each with a set-up identity, can exchange E2E encrypted text messages, with sent/delivered/read status, while the server only ever handles opaque ciphertext and retains nothing longer than delivery requires."
status: implemented
---

# Plan: Send/receive E2E encrypted text messages (1:1)

## Overview

| Field      | Value                   |
| ---------- | ----------------------- |
| **Goal**   | Server (authenticated messaging API), wasm-crypto (stateful session + encrypt/decrypt), and web client (chat UI) together let two registered users exchange readable, end-to-end encrypted text messages |
| **Source** | GitHub issue #2 — https://github.com/Thibault-Savenkoff/UmbraChat/issues/2 |

## Phases

| #   | Phase        | File                         |
| --- | ------------ | ----------------------------- |
| 1   | Server: authenticated messaging API | [`phase-1.md`](./phase-1.md) |
| 2   | wasm-crypto: stateful sessions, encrypt/decrypt | [`phase-2.md`](./phase-2.md) |
| 3   | Web client: chat UI | [`phase-3.md`](./phase-3.md) |

## Resources

| Source | Verified          |
| ------ | ----------------- |
| `libsignal-protocol` source (`rust/protocol/src/session.rs`, `session_management.rs`) | `process_prekey_bundle` (X3DH session establishment) and `message_encrypt`/`message_decrypt` (Double Ratchet) are real, public functions in the already tag-pinned crate |
| `libsignal-protocol` source (`rust/protocol/src/storage/inmem.rs`) | Ships a public, non-test-gated reference store implementation (`InMemSignalProtocolStore` and per-concern stores) — no need to hand-roll the storage traits. These stores derive `Clone` but not `Serialize`, so persisting across a page reload needs an explicit export of the individual records (which do have their own wire `.serialize()`), not a direct struct serialization |

## Decisions

| Decision   | Why   |
| ---------- | ----- |
| Per-request signature auth (client signs method+path+timestamp+body-hash with its identity private key, server verifies against the stored public key), no sessions or tokens | Fetching pending messages requires the server to know who's asking — a gap that didn't exist before since registration was write-only. Reuses the identity signing key already established in issue #1 instead of building a login/session system; stays stateless server-side |
| Offline delivery for this issue means plain store-and-forward (server holds the ciphertext, client polls); the harder edge cases (multi-day gaps, ordering, dedup) belong to issue #6, which depends on this one | Keeps this phase buildable; the dedicated offline-sync story is the right place for that robustness, not a duplicate of it here |
| Delivered/read receipts are not columns in the messages table — they're just more encrypted messages sent back through the same pipe, decrypted and interpreted client-side | The server doesn't need to understand delivery semantics at all if receipts are opaque ciphertext like everything else; keeps the schema minimal and avoids the server learning anything about read/delivery timing beyond what routing already requires |
| The server fetch endpoint deletes each message row as it returns it (fetch-and-remove, not fetch-and-mark) | Minimizes retention — once delivered, the server has no reason to keep a copy of ciphertext it can't read anyway |
| Sender identity is visible to the server via the auth scheme (it has to know who's sending to store/route the message); hiding sender identity too (Signal's "sealed sender", which `libsignal-protocol` already has a `sealed_sender` module for) is deferred to a future issue, not built here | A real additional privacy layer, but a distinct, sizeable piece of protocol work on its own — scoping it into this issue would make it too large for one pass. Named here so it's tracked, not silently dropped |
