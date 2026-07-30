---
objective: "A user can set a local-only nickname for a contact (shown in place of the raw account id), and can opt in to a typing indicator that never leaks anything to a contact whose conversation isn't open."
status: implemented
---

# Plan: Nicknames + optional typing indicator

## Overview

| Field      | Value                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------- |
| **Goal**   | Local nicknames for contacts, plus an opt-in (default off) typing indicator that follows the project's presence-oracle-safe pattern |
| **Source** | [Issue #35](https://github.com/Thibault-Savenkoff/UmbraChat/issues/35)                   |

## Phases

| #   | Phase                                  | File                          |
| --- | --------------------------------------- | ----------------------------- |
| 1   | Nicknames: storage + UI                 | [`phase-1.md`](./phase-1.md)  |
| 2   | Typing signal: envelope + poll wiring   | [`phase-2.md`](./phase-2.md)  |
| 3   | Typing indicator: Settings + composer UI | [`phase-3.md`](./phase-3.md) |

## Decisions

| Decision                                                                                          | Why                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nicknames live only in a local, unencrypted IndexedDB store (`nicknameStore.ts`), never sent to the server or the other party | Purely cosmetic local metadata; account ids stay the real identity/addressing mechanism, matching how `pushPrefsStore.ts` already treats non-sensitive local UI preferences                       |
| Typing signals are only sent while composing in an already-open conversation, and only acted on by a recipient who also has that same conversation open | Mirrors the presence-oracle fix already made for read receipts (`markConversationRead`) - a typing ping must not let a sender probe an unopened contact's online/foreground state                  |
| Typing indicator defaults to OFF, opt-in via Settings                                             | Same "opt-in for anything that reveals activity/presence" pattern already used for read-receipt semantics; the issue explicitly calls this out as a requirement, not just a preference             |
| No server-side changes for the typing signal - it's sent as just another opaque encrypted envelope through the existing `sendToContact`/`fetchMessages` pipe | Server is fully type-blind (confirmed: `messages` table has no `type` column, `ciphertext` is opaque `BYTEA`); a typing ping needs no new endpoint, no schema change, and inherits the existing fetch-and-delete lifecycle (gone within one poll interval) |
