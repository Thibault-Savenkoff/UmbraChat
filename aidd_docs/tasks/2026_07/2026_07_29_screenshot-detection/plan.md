---
objective: "The web client honestly discloses that it cannot detect screenshots, rather than silently doing nothing or implying protection it can't provide."
status: pending
---

# Plan: Screenshot detection

## Overview

| Field      | Value                   |
| ---------- | ----------------------- |
| **Goal**   | Web is explicitly the "platform without screenshot-detection support" case the issue's own second scenario covers - satisfy that scenario honestly, don't fake the first one |
| **Source** | GitHub issue #5 — https://github.com/Thibault-Savenkoff/UmbraChat/issues/5 |

## Phases

| #   | Phase        | File                         |
| --- | ------------ | ----------------------------- |
| 1   | Web: disclosure notice | [`phase-1.md`](./phase-1.md) |

## Resources

None consulted beyond the existing codebase.

## Decisions

| Decision   | Why   |
| ---------- | ----- |
| No detection heuristic on web (no `visibilitychange`/`blur` listener pretending to catch screenshots) | Browsers have no screenshot API. `blur`/`visibilitychange` fire for alt-tab, notifications, devtools, and dozens of other reasons unrelated to screenshots - shipping that would generate constant false positives, which is worse than disclosing the limitation: it trains users to ignore the warning, directly undermining the issue's own goal of not "falsely implying protection" |
| No `screenshot` envelope type, no receiving/display logic for one | The only client in this repo is the web PWA, which can never send one (no detection exists to trigger it) - protocol support for a message no shipped client can produce is speculative scaffolding for iOS/Android clients that don't exist yet in this codebase. Add the envelope type when a native client that can actually detect screenshots gets built, not before |
| The disclosure is persistent and always visible in the conversation, not a one-time dismissible toast | A one-time toast a user can miss or forget doesn't satisfy "honestly disclose" - the whole point is the user should never assume screenshot protection is active while chatting on web |
