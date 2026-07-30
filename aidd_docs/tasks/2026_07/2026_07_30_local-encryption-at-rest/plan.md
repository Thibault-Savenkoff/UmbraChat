---
objective: "A user can opt in, from a new Settings screen, to encrypting everything stored locally (identity/session keys, message history, group metadata) behind a passphrase they set - unlocked once per app open, off by default."
status: implemented
---

# Plan: Optional local storage encryption at rest

## Overview

| Field      | Value                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------ |
| **Goal**   | Encrypt IndexedDB contents at rest, opt-in, passphrase-derived key held only in memory per session |
| **Source** | [Issue #27](https://github.com/Thibault-Savenkoff/UmbraChat/issues/27)                            |

## Phases

| #   | Phase                                  | File                          |
| --- | --------------------------------------- | ----------------------------- |
| 1   | Vault primitive + storage wiring         | [`phase-1.md`](./phase-1.md)  |
| 2   | Settings screen + enable/disable flow    | [`phase-2.md`](./phase-2.md)  |
| 3   | Unlock screen at boot                    | [`phase-3.md`](./phase-3.md)  |
| 4   | WebAuthn/biometric unlock (stretch)      | [`phase-4.md`](./phase-4.md) - blocked, deferred to [issue #29](https://github.com/Thibault-Savenkoff/UmbraChat/issues/29) |

## Decisions

| Decision                                                                                  | Why                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Off by default, opt-in via Settings**, not forced on every user                           | Explicit user decision (issue #27): this app targets personal/small-group messaging, not state secrets. Forcing an unlock screen on everyone to protect the minority who need it is disproportionate. Named trade-off, accepted: users who don't enable it aren't protected by default. |
| Key held **only in memory**, re-derived from the passphrase on every fresh app open          | Matches the discussed threat model exactly: protect against a device seized/stolen *after* the app was closed, without asking the user to re-enter a passphrase on every interaction while actively using it.                                                                        |
| **Passphrase → PBKDF2 → AES-GCM**, native WebCrypto only, no new dependency                  | Same discipline as every other crypto choice this session (Signal Protocol, HTTPS certs) - `crypto.subtle` already does PBKDF2 and AES-GCM; no argon2/bcrypt library needed for a browser-only feature.                                                                                |
| Correctness check on unlock is **AES-GCM's own auth tag failing**, not a separate password hash | Deriving the wrong key from a wrong passphrase and trying to decrypt a known record fails via GCM's built-in authentication. Storing a separate password verifier would be redundant and one more thing that could leak information about the passphrase.                            |
| **No OS keychain integration**                                                              | Not available to a browser-sandboxed web app (only native/Electron apps can do this) - this project is deliberately a web PWA. Named and ruled out explicitly in the issue, not silently skipped.                                                                                     |
| Generic object-level (de)serialization helper, not per-store bespoke encryption code         | `keyStore.ts`, `messageStore.ts`, `groupStore.ts` all use the same IndexedDB put/get shape. One shared `encryptForStorage`/`decryptFromStorage` pair (walks the object, base64-encodes any `Uint8Array` it finds, JSON-stringifies, AES-GCM encrypts) is reused by all three instead of three separate implementations. |
| WebAuthn/biometric unlock is its own phase, may split into a follow-up issue                 | Named in the source issue as "phase 2 if it doesn't fit cleanly" - browser/authenticator support for the PRF extension needed to derive a symmetric key varies; don't let it block shipping the passphrase path, which is the one that actually matters.                              |
