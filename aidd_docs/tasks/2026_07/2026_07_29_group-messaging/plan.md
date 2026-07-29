---
objective: "A user can create a group, exchange E2E encrypted text messages visible to all current members, and remove a member so they stop receiving new messages - the server never learns group membership or content."
status: implemented
---

# Plan: E2E encrypted group messaging

## Overview

| Field      | Value                   |
| ---------- | ----------------------- |
| **Goal**   | A group is a purely client-side construct - a local roster plus fan-out of ordinary 1:1-encrypted envelopes over each member's existing pairwise session. No new server capability, no new crypto primitive |
| **Source** | GitHub issue #10 — https://github.com/Thibault-Savenkoff/UmbraChat/issues/10 |

## Phases

| #   | Phase        | File                         |
| --- | ------------ | ----------------------------- |
| 1   | Group envelopes, local roster, fan-out send/receive | [`phase-1.md`](./phase-1.md) |
| 2   | Web: create-group flow, group conversation screen, remove member | [`phase-2.md`](./phase-2.md) |

## Resources

None consulted beyond the existing codebase.

## Decisions

| Decision   | Why   |
| ---------- | ----- |
| Stacked on the unmerged `feat/multi-device-sync` branch, not `main` | The design below depends on that branch's `sendToContact` fan-out primitive and device-scoped message fetch - a real dependency this issue's own text didn't anticipate (it only lists #2), created by the architecture choice made here, not arbitrary stacking |
| **Pairwise fan-out, not Sender Keys.** A group message is N ordinary pairwise-encrypted envelopes (one per member, each already fanned out to that member's own devices by the existing `sendToContact`), tagged with a `groupId` - not a single message encrypted once under a shared group key | The alternative (Signal's real Sender Keys protocol) needs a distinct cryptographic primitive this project's pinned `libsignal-protocol` version has not been verified to expose, and would be new, unaudited crypto code in a privacy-first app where getting it wrong is a real data-leak risk - exactly what the issue's own "critic" impact rating warns about. Pairwise fan-out reuses 100% already-shipped, already-tested crypto (every member's *existing* 1:1 session), at the cost of O(members × their device count) sends per group message instead of one - an accepted cost at this project's personal/small-group scale |
| No server-side group concept at all - no `groups` table, no new endpoint | Membership and message fan-out are entirely client-driven using the existing message pipe; the server never sees anything but more opaque per-device envelopes, keeping the zero-knowledge property intact with zero new server surface |
| Membership travels as a `group-invite` (initial roster) / `group-update` (later changes) envelope, fanned out the same way messages are, and each member's client keeps its own local copy of the roster | No single source of truth to keep synced server-side; every member converges on whatever roster they've most recently received, the same eventual-consistency-via-polling model the rest of this app already uses |
| **Removal is enforced by each remaining member's client checking "is the sender still in my local roster for this group?" on receipt - not by revoking the removed member's ability to encrypt** | This is the honest limit of a no-shared-key design: there's no group secret to rotate, so a removed member isn't cryptographically prevented from still encrypting a `group-text` envelope to their old pairwise sessions with former members. What removal actually guarantees: (1) the removed member stops receiving anything new, because remaining members' fan-out lists no longer include them, and (2) anything they *did* send is dropped by every remaining member's client before it's ever shown, because the sender no longer matches that member's own roster. A removed member forwarding intercepted content through a *still-member* accomplice is a social trust problem, not a cryptographic one - the same limitation every messaging app with human forwarding has, not specific to this design. Named here in full rather than glossed over, since the issue's own DoD phrase ("keys rotate as needed") implies a stronger guarantee than a pure pairwise design can give without Sender Keys |
| Groups get their own minimal conversation screen, not the existing 1:1 `Conversation.tsx` | That screen has calls/disappearing-timer/self-destruct-file UI baked in that doesn't cleanly extend to "N recipients" without real additional design (group calling is a distinct, harder problem, explicitly out of scope - same boundary issue #9 already drew for 1:1-only calls). This issue's DoD only asks for exchanging text messages visible to all members; scoped to that |
