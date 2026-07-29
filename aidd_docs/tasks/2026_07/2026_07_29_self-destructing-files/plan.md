---
objective: "A sender can mark a sent file to delete itself on the recipient's device either after being opened or after a time limit, and can see whether it was opened."
status: implemented
---

# Plan: Self-destructing files

## Overview

| Field      | Value                   |
| ---------- | ----------------------- |
| **Goal**   | Per-file destruct choice at send time (on-open or timed), independent of the conversation-wide disappearing-message timer, reusing the existing expiry/sweep machinery those built |
| **Source** | GitHub issue #7 — https://github.com/Thibault-Savenkoff/UmbraChat/issues/7 |

## Phases

| #   | Phase        | File                         |
| --- | ------------ | ----------------------------- |
| 1   | Destruct envelope, timed expiry, open-triggered deletion | [`phase-1.md`](./phase-1.md) |
| 2   | Web: destruct-mode picker, open-triggers-delete, status visibility | [`phase-2.md`](./phase-2.md) |

## Resources

None consulted beyond the existing codebase.

## Decisions

| Decision   | Why   |
| ---------- | ----- |
| Per-file choice at send time, not tied to the conversation-wide disappearing-message timer setting | The issue asks for a sender to mark *a file* as self-destructing - a send-time opt-in, not a standing per-conversation policy like the disappearing-message timer already is. Different concept, kept separate rather than overloading one setting for two meanings |
| Reuses `ChatMessage.timerSeconds`/`expiresAt` and the existing sweep in `poll()` (already generic, not text-only despite where it was first built) - no new deletion mechanism | The disappearing-messages sweep already filters *any* message with a past `expiresAt`, file or text; only the field-population sites were scoped to text. Populating them for files too gets the timed-destruct case for free |
| Timed file destruction is pegged to send/receive time, not to a read receipt like text messages are | The issue is explicit: "the time limit elapses **without the recipient opening it**, the file is deleted anyway" - the opposite of text's "peg to read" design, which exists specifically so an unread message doesn't vanish unseen. Files should vanish on schedule even if never opened |
| Only the recipient's copy is destroyed by the trigger; the sender's copy persists with its status updated to `"opened"` for visibility | Matches the DoD precisely: "gone from the **recipient's** device" and "sender can **see** whether it was opened/destroyed" describe two different devices doing two different things, not a mirrored deletion on both sides |
| "Opened" = the recipient clicks the file's Download link | The only "view" action this app has for a file. A `file-opened` receipt (same envelope family as the existing `delivered`/`read` receipts) reports it back to the sender |
