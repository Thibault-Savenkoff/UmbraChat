---
objective: "A user who opts in from Settings gets a real OS-level notification when a message arrives while the app is fully closed, showing either a generic 'New message' or nothing distinguishing at all - never sender or content - and the app becomes installable as a PWA, which iOS requires for this to work at all."
status: in-progress
---

# Plan: Push notifications (generic/silent)

## Overview

| Field      | Value                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------ |
| **Goal**   | Web Push delivery of content-free notifications, client-chosen display level, opt-in       |
| **Source** | [Issue #33](https://github.com/Thibault-Savenkoff/UmbraChat/issues/33)                     |

## Phases

| #   | Phase                                     | File                          |
| --- | ------------------------------------------- | ------------------------------ |
| 1   | Server: subscriptions + push on message arrival | [`phase-1.md`](./phase-1.md)  |
| 2   | PWA installability (manifest + icons)        | [`phase-2.md`](./phase-2.md)  |
| 3   | Service Worker: push + click handling        | [`phase-3.md`](./phase-3.md)  |
| 4   | Settings UI + client subscription wiring     | [`phase-4.md`](./phase-4.md)  |

## Decisions

| Decision                                                                                       | Why                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Only "generic" and "silent" display levels in scope - "full content" is deferred to a follow-up issue | Full content means the Service Worker itself decrypting messages (the server can never see plaintext), which needs its own poll+decrypt cycle - a real risk of racing the main page's poll loop over the same Double Ratchet session state and corrupting it. Explicit user decision, not a silent scope cut. |
| The server always sends one uniform, content-free push payload - display level is a purely client-side rendering choice | Keeps the server exactly as "dumb" as every other part of this design - it never learns or customizes anything per-user, per this app's whole zero-knowledge philosophy.                                                                                       |
| Display-level preference stored in IndexedDB, not `localStorage`                                     | Service Workers cannot access `localStorage` at all (it's synchronous and DOM-tied) - only IndexedDB is available to them. A real technical constraint, not a style choice.                                                                                     |
| VAPID private key server-side config only; public key baked into the client build (`VITE_VAPID_PUBLIC_KEY`) | Matches the existing `VITE_API_BASE`/`VITE_STUN_URL` env-var pattern already used for exactly this shape of "public config, private secret" split.                                                                                                              |
| Reuse the `web-push` crate (confirmed on crates.io, v0.11.0) for VAPID signing + payload encryption, not a hand-rolled implementation | Both are well-specified, already-solved protocol details (RFC 8291/8292) - reinventing them is real risk (crypto/protocol bugs) for zero benefit.                                                                                                                |
| Accepted trade-off, named explicitly to the user and confirmed: Apple/Google's push infrastructure can observe push timing/delivery metadata, never content or sender | Structurally unavoidable on any platform (Signal's own apps have the same constraint) - mitigated, not eliminated, by the content-free payload design above.                                                                                                    |
| PWA installability (`manifest.json`, icons) is a real prerequisite, not optional polish             | iOS Safari only delivers Web Push to a "Added to Home Screen" installed PWA (16.4+ restriction), never a regular tab - confirmed against Apple's documented behavior, not assumed.                                                                              |
