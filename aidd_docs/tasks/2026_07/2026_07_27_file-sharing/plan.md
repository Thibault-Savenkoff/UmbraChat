---
objective: "Two users can send and receive E2E encrypted files (images, documents) through the existing message pipe, with visible send/receive progress and a client-side size limit."
status: implemented
---

# Plan: Send/receive E2E encrypted files

## Overview

| Field      | Value                   |
| ---------- | ----------------------- |
| **Goal**   | Files travel through the exact same encrypted message pipe issue #2 built - a new envelope type, not a new server capability |
| **Source** | GitHub issue #6 — https://github.com/Thibault-Savenkoff/UmbraChat/issues/6 |

## Phases

| #   | Phase        | File                         |
| --- | ------------ | ----------------------------- |
| 1   | Server: raise the request body size limit | [`phase-1.md`](./phase-1.md) |
| 2   | Web: file picker, encrypted send/receive, progress | [`phase-2.md`](./phase-2.md) |

## Resources

None consulted beyond the existing codebase.

## Decisions

| Decision   | Why   |
| ---------- | ----- |
| Files are just another message envelope (`{type: "file", filename, mimeType, size, data}`), sent and received through the existing `POST`/`GET /v1/messages` and `SignalStore.encrypt`/`decrypt` - no new server table, no new endpoint, no new crypto | Everything needed already exists from issue #2: opaque server storage, E2E encryption, delivery. A separate file-storage subsystem would duplicate that for no benefit at this project's scale |
| Client-side cap of 8MB per file, server body limit raised from 1MB to 12MB (8MB raw + base64's ~33% overhead + envelope/JSON overhead, with headroom) | "Images, documents" at a personal-messenger scale, not video. Keeps the free-tier ($0) hosting viable and avoids needing chunked/resumable upload, which would be real added complexity unjustified at this size class |
| Progress is stage-based (encrypting → sending → sent; received once decrypted), not byte-level percentage | A real, visible signal that satisfies the DoD without a parallel XHR transport layer alongside the existing `fetch`-based signed requests - byte-level progress on an ≤8MB transfer over the batched `/v1/messages` poll wouldn't be very meaningful anyway (multiple messages can arrive in one fetch). Named here as a deliberate simplification, not silently under-built |
