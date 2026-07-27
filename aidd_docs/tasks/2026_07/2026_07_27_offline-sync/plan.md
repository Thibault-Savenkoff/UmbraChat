---
objective: "Messages sent to an offline user arrive, in order and without loss or duplication, the moment they reconnect - not delayed, not shuffled."
status: implemented
---

# Plan: Offline message queue, synced on reconnect

## Overview

| Field      | Value                   |
| ---------- | ----------------------- |
| **Goal**   | Fix two real gaps in the existing fetch-and-delete message pipe (issue #2) rather than build new infrastructure: unordered delivery, and a delayed first fetch on reconnect |
| **Source** | GitHub issue #3 — https://github.com/Thibault-Savenkoff/UmbraChat/issues/3 |

## Phases

| #   | Phase        | File                         |
| --- | ------------ | ----------------------------- |
| 1   | Ordered, immediate delivery on reconnect | [`phase-1.md`](./phase-1.md) |

## Resources

None consulted beyond the existing codebase.

## Decisions

| Decision   | Why   |
| ---------- | ----- |
| One phase, not three | Issue #2 already built the message pipe (server storage/fetch, client polling). This issue is a correctness fix to that pipe, not a new capability — no new server table, no new crypto. Splitting it into server/wasm-crypto/web phases the way #1 and #2 needed would be ceremony without substance |
| Keep fetch-and-delete; don't add a delivery-acknowledgment protocol | A fully crash-safe inbox (survives the client losing the HTTP response after the server already deleted the row) needs the server to track some notion of "delivered, pending ack" - which reintroduces exactly the server-side delivery-state tracking the privacy-first design in issue #2 deliberately avoided. That residual risk (network drop between the server's delete and the client processing the response) is accepted and documented rather than built around, since fixing it properly would cost more architecture than this issue's scope justifies |
