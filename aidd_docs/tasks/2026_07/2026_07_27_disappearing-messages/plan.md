---
objective: "A per-conversation disappearing-message timer, synced between both participants, actually deletes expired messages from each device rather than just hiding them."
status: pending
---

# Plan: Disappearing messages

## Overview

| Field      | Value                   |
| ---------- | ----------------------- |
| **Goal**   | Messages carry a per-conversation expiry, pegged to the moment each side reads them, and are hard-deleted from local storage once expired - client-only, same encrypted pipe as every other feature so far |
| **Source** | GitHub issue #4 — https://github.com/Thibault-Savenkoff/UmbraChat/issues/4 |

## Phases

| #   | Phase        | File                         |
| --- | ------------ | ----------------------------- |
| 1   | Timer envelope, per-message expiry, hard delete | [`phase-1.md`](./phase-1.md) |
| 2   | Web: timer picker, expiry indicator | [`phase-2.md`](./phase-2.md) |

## Resources

None consulted beyond the existing codebase.

## Decisions

| Decision   | Why   |
| ---------- | ----- |
| The timer setting and its sync are just another envelope type (`{type: "timer", seconds}`) on the existing encrypted pipe - no server changes at all | Same reasoning as file sharing: server storage is already opaque, so a control message needs no new capability. Keeps the zero-knowledge property intact |
| Each message stores the timer that was active when it was created (`timerSeconds`); expiry (`expiresAt`) is computed once, at the moment that copy is "read", and never recomputed | Satisfies the acceptance criterion precisely - changing the timer later must not alter an expiry a message already has, and must not retroactively apply the new timer to a message that was created under the old one but hadn't been read yet |
| "Read" for the receiving device is the same moment `poll()` already treats as read today (decrypt time, per the existing delivered+read-together simplification) - no new read-tracking mechanism | Reuses the existing ponytail-marked simplification instead of building real read-tracking just for this feature |
| "Read" for the sender's own copy is the moment the existing read-receipt envelope arrives back, not send time | Matches the acceptance criterion's wording ("after a message is read") - starting the sender's clock at send time would let a message never opened by the recipient still expire on the sender's device |
| Expired messages are swept during the existing poll cycle (already running every 3s while a conversation is open), not a dedicated timer or background worker | No new interval to manage; deletion is necessarily best-effort while the app is closed anyway, same limitation the polling model already accepts |
