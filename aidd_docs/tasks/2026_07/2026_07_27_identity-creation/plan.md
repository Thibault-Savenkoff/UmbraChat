---
objective: "A new user can create an UmbraChat account from the web app, with identity keys generated on-device and only public key material ever reaching the server."
status: implemented
---

# Plan: Account & device identity creation

## Overview

| Field      | Value                   |
| ---------- | ----------------------- |
| **Goal**   | Server + web client support account creation with on-device libsignal identity key + prekey bundle generation, zero-knowledge registration, and a visible safety number |
| **Source** | GitHub issue #1 — https://github.com/Thibault-Savenkoff/UmbraChat/issues/1 |

## Phases

| #   | Phase        | File                         |
| --- | ------------ | ----------------------------- |
| 1   | Server: registration API + schema | [`phase-1.md`](./phase-1.md) |
| 2   | WASM crypto wrapper: official libsignal-protocol compiled for the browser | [`phase-2.md`](./phase-2.md) |
| 3   | Web client: identity generation + registration UI | [`phase-3.md`](./phase-3.md) |

## Resources

| Source | Verified          |
| ------ | ----------------- |
| https://github.com/signalapp/libsignal | The official Signal Protocol implementation. Its Rust crate `libsignal-protocol` lives inside this monorepo and is consumed as a git dependency, not published to crates.io under Signal's ownership |
| https://crates.io/crates/libsignal-protocol | Confirmed this is an unrelated, unofficial third-party crate (Michael-F-Bryan/libsignal-protocol-rs, a wrapper around the old C library) — must not be used, it is a name-collision trap |
| https://github.com/signalapp/libsignal/tags | Confirmed real release tags exist (latest `v0.99.1`) to pin the git dependency to |
| https://www.npmjs.com/package/@signalapp/libsignal-client | Confirmed this package depends on `node-gyp-build` (a native Node addon), has no `browser` field and no WASM build — cannot run in a browser. Signal's own "web" client is Electron (a Node runtime), not a real browser, which is why no WASM build exists |

## Decisions

| Decision   | Why   |
| ---------- | ----- |
| Depend on `libsignal-protocol` via a git dependency pinned to a tag on `signalapp/libsignal`, never via crates.io | The crates.io package of the same name is an unrelated, unaudited crate — using it by mistake would silently swap out the vetted crypto this whole project's security model rests on |
| Ship the web client first; native iOS/Android identity creation is deferred to follow-up issues | Building three client platforms in a single plan is too large for one executor pass each. Web (React) is fastest to build and proves the server's registration contract; the mobile clients then implement against that already-verified API |
| Compile the official `libsignal-protocol` Rust crate to WASM ourselves (phase 2), rather than using `@signalapp/libsignal-client` or a third-party WASM port | Discovered mid-implementation that Signal publishes no browser/WASM build at all. Building our own thin `wasm-bindgen` wrapper around the same official, tag-pinned crate the server already uses keeps 100% official crypto with no new trust dependency, at the cost of maintaining that wrapper ourselves |
