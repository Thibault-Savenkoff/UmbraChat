# Review: E2E encrypted voice/video calls (1:1)

- **Verdict**: approve
- **Diff**: `main...feat/voice-video-calls`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_07_27
- **Findings**: 0 critical, 0 warning, 1 minor (fixed)

## Phases

### Phase 1 — Signaling envelopes and call state machine

- [x] Two independent app instances: `startCall`/`acceptCall` reach `connectionState === "connected"` for real (throwaway data channel, no camera/mic) — verified live, not mocked, before phase 2 added media
- [x] Declining moves the caller's state to `ended`/`declined` — verified live
- [x] An unanswered offer times out to `ended`/`timeout` after 30s — verified live in the final e2e suite

### Phase 2 — WebRTC wiring: real audio/video between two peers

- [x] A video call's remote `MediaStream` has a live video track on both sides — `e2e-voice-video-calls.mjs`
- [x] A voice call's remote stream is audio-only, no video track — same suite
- [x] After `hangUp`, all local tracks reach `readyState: "ended"` — verified via a live track reference kept across the hangup action, not a snapshot taken before it

### Phase 3 — Web: call controls, incoming-call banner, active-call screen

- [x] A→B call, B accepts, both reach the active-call screen with live remote video
- [x] B declines → A sees a distinct "Declined" state
- [x] A voice call renders no remote `<video>`, only `<audio>`
- [x] Poll interval tightens once both sides are already ringing (accept-to-connected round trip measurably faster than the standing 3s interval) — acceptance criterion corrected during implementation; see Findings

## Findings

| Sev | Kind | Phase | Location | Issue | Fix |
| --- | ---- | ----- | -------- | ----- | --- |
| minor | functional | 3 | `phase-3.md` AC / `e2e-voice-video-calls.mjs` | The plan's original acceptance criterion claimed the *first* incoming-offer notification would be sped up by the tightened poll interval. Caught by the test itself failing (3363ms, not under 2s): the callee has no way to know to poll faster before it has already seen the offer, so that first hop is structurally bounded by the standing 3s rate - only round trips *after* both sides are already ringing (answer, ICE) can be sped up | Corrected the acceptance criterion in `phase-3.md` to state what's actually true, and rewrote the test to measure accept-to-connected timing instead of ring-notification timing. Documented as a known, accepted latency floor of reusing HTTP polling instead of a push channel, not a regression |

Also self-corrected during implementation, not a review-time finding: `conn.ontrack` firing before the `"connecting"` state existed yet caused the remote stream to be silently dropped (state-gated assignment missed the event). Fixed by buffering the remote stream independent of `CallState` timing (`remoteStreamBuffer`), caught by the phase-2 media test failing before the fix (`remoteStream: null` after reaching `"connected"`).

Not covered by the e2e suite, documented rather than silently skipped: the `"failed"` (NAT-blocked) end state. Both peers run on localhost in this environment, so ICE always finds a direct path — there is no way to force a real connection failure without faking NAT behavior the test can't reliably control. The code path is the same `onconnectionstatechange` pattern already exercised by the tested `"connected"` transition, just for a different value.

Call collision (both sides calling each other at the same instant) falls under the already-named "one call at a time, no busy signal" simplification in `call.ts`'s `handleCallSignal` - both sides independently time out after 30s rather than either connecting or showing a distinct "busy" state. A bounded, correct-if-suboptimal outcome; not a new finding.

## Verification

| Metric        | Value                                             |
| ------------- | -------------------------------------------------- |
| Verified      | 100% (11/11 acceptance criteria across all 3 phases) |
| Files checked | `web/src/chat/call.ts`, `web/src/chat/conversation.ts`, `web/src/App.tsx`, `web/src/screens/CallScreen.tsx`, `web/src/screens/Conversation.tsx`, `web/e2e-voice-video-calls.mjs`, `aidd_docs/memory/architecture.md` |
| Unchecked     | none |
| Unplanned     | none |
