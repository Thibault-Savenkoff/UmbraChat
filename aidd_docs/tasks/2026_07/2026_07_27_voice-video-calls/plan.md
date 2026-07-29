---
objective: "Two users can complete an E2E-encrypted 1:1 voice or video call over a direct P2P WebRTC connection, with clear declined/unreachable/failed states - no media ever touches the server."
status: implemented
---

# Plan: E2E encrypted voice/video calls (1:1)

## Overview

| Field      | Value                   |
| ---------- | ----------------------- |
| **Goal**   | WebRTC audio/video, direct peer-to-peer (STUN-assisted, no TURN per the settled architecture decision), signaled over the exact same encrypted message pipe every other feature already uses |
| **Source** | GitHub issue #9 — https://github.com/Thibault-Savenkoff/UmbraChat/issues/9 (scope corrected 2026-07-27 to drop the TURN fallback - see `aidd_docs/memory/architecture.md`) |

## Phases

| #   | Phase        | File                         |
| --- | ------------ | ----------------------------- |
| 1   | Signaling envelopes and call state machine | [`phase-1.md`](./phase-1.md) |
| 2   | WebRTC wiring: real audio/video between two peers | [`phase-2.md`](./phase-2.md) |
| 3   | Web: call controls, incoming-call banner, active-call screen | [`phase-3.md`](./phase-3.md) |

## Resources

None consulted beyond the existing codebase.

## Decisions

| Decision   | Why   |
| ---------- | ----- |
| Call signaling (offer/answer/ICE candidates/end) travels as more control envelope types on the existing encrypted message pipe - no new server endpoint, no WebSocket, no signaling server | Continues the pattern every feature so far has used (files, disappearing-timer). The server never needs to understand call semantics, keeping it zero-knowledge with zero new surface. Trade-off: the existing 3s poll interval is too slow for responsive call setup (multiple signaling round trips), so the poll interval tightens to 500ms specifically while a call is being placed or is ringing, reverting to 3s once connected or ended - no new transport, just a parameter change during an already-short-lived window |
| No TURN relay - direct P2P only, STUN-assisted | Already decided and recorded in `aidd_docs/memory/architecture.md`; this plan implements that decision, it doesn't relitigate it |
| "Unreachable" is a client-side answer timeout (30s with no answer), not a real presence/online check | The app has no presence system at all today - building one just for this would be a much larger, separate feature. A timeout is the same class of simplification the project has already accepted elsewhere (e.g. delivered+read receipts collapsed into one moment because there's no background-delivery tracking) |
| 1:1 only, no group calls | Matches the existing single-active-contact model everywhere else in the app (one open conversation at a time); group calling is issue #10's concern, not this one |
| The STUN server itself is a hosting/ops concern (self-hosted coturn in STUN-only mode), not application code - the client takes a configurable STUN URL | Consistent with this repo never containing deployment/infra code for the Postgres or Axum server either; only `iceServers` configuration lives in the client |
