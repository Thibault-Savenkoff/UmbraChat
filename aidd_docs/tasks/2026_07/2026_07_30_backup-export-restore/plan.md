---
objective: "A user can export an encrypted backup file from Settings and restore it on a fresh device (no existing local account) to recover their identity, sessions, messages, and groups - entirely client-side, no server round trip."
status: implemented
---

# Plan: Manual encrypted backup export/restore

## Overview

| Field      | Value                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------- |
| **Goal**   | Passphrase-protected export/import of everything stored locally, as a single portable file |
| **Source** | [Issue #31](https://github.com/Thibault-Savenkoff/UmbraChat/issues/31)                    |

## Phases

| #   | Phase                          | File                          |
| --- | ------------------------------- | ------------------------------ |
| 1   | Backup primitive + export UI     | [`phase-1.md`](./phase-1.md)  |
| 2   | Restore UI + boot wiring         | [`phase-2.md`](./phase-2.md)  |

## Decisions

| Decision                                                                                     | Why                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A fresh, independent passphrase per export - not tied to whatever local-encryption passphrase (if any) is already set | Separate concerns: local encryption protects data at rest on *this* device; a backup file is portable and can end up anywhere (email, USB). Reusing a passphrase between them would mean compromising one compromises both. |
| Reuse `crypto/vault.ts`'s `deriveKey`/`replaceBytes`/`restoreBytes` (exported for this), not a second implementation | Same PBKDF2 -> AES-GCM shape as local encryption, no reason to duplicate the WebCrypto boilerplate or the Uint8Array<->base64 walker.                                                                                     |
| Never touches the server - export is pure client-side file generation, import is pure client-side store repopulation | Matches the app's existing zero-knowledge server design and the user's explicit reasoning: a high-threat-profile user should be able to ignore this feature entirely at zero cost, not have it phone home.               |
| Restore is only offered on the anonymous screen (no existing local account) - no merge-with-existing-data flow | Matches how "Link This Device" is already scoped the same way. A device restoring a lost identity has nothing local to conflict with by definition.                                                                     |
| Restored account keeps its original device id and identity keys - no server re-registration | The server never held the identity private key to begin with; it already has a device record for that identity. Restoring locally and resuming is indistinguishable, from the server's point of view, from that same device coming back online. |
