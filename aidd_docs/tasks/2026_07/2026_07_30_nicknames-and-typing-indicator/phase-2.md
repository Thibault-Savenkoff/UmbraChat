---
status: done
---

# Instruction: Typing signal - envelope + poll wiring

## Architecture projection

```txt
.
└── web/src/
    └── chat/
        └── conversation.ts ✏️ new `TypingEnvelope` in the `Envelope` union, `sendTypingSignal`, a module-level typing-state pub/sub, `poll()` gains an `onTypingSignal` slot
```

No server or App.tsx changes in this phase - purely the transport/signal layer, mirroring how `call.ts`'s signaling primitives were built before `App.tsx` wired UI to them. UI wiring is phase 3.

## User Journey

```mermaid
flowchart TD
  A[Alice is composing, conversation with Bob open] --> B[sendTypingSignal fires, debounced]
  B --> C[Encrypted TypingEnvelope sent through sendToContact like any other envelope]
  C --> D[Bob's poll() decrypts it]
  D --> E{Bob has this same conversation open?}
  E -->|yes| F[typing state flips true, notifies subscribers]
  E -->|no| G[Dropped - never surfaced, matches calls/timer/file-opened being open-contact-only today]
  F --> H[No follow-up signal within the idle window]
  H --> I[Typing state auto-clears locally]
```

## Tasks to do

### `1)` `Envelope` union + `sendTypingSignal`

1. Add `interface TypingEnvelope { type: "typing" }` to the envelope set (`conversation.ts:107`'s union) - no `refId`, no extra payload, mirrors `CallEnvelope`'s minimalism.
2. `sendTypingSignal(contactId, account, store): Promise<void>` - a one-line wrapper around `sendToContact`, exactly like `sendCallSignal` (`conversation.ts:146-149`). No local persistence, no return value beyond the promise resolving.

### `2)` Typing state pub/sub

1. A module-level `typingState` (boolean, or a small object if `{ contactId, active }` is needed to guard against a stale signal from a since-closed conversation) plus `subscribeToTypingState`/`setState`-style notification, following `call.ts`'s `listeners`/`subscribeToCallState` pattern (`call.ts:35-47`) rather than IndexedDB - this is transient UI state, never persisted.
2. An idle-timeout auto-clear (`setTimeout`, mirroring `call.ts`'s `IDLE_RESET_MS`/`scheduleIdleReset` at `call.ts:21,62-65`): if no further typing signal arrives within the window, the state flips back to "not typing" on its own, since a polled transport has no delivery guarantee for an explicit "stopped typing" signal.

### `3)` `poll()` wiring

1. Add an `onTypingSignal?: () => void` parameter to `poll()` (alongside the existing `onCallSignal`/`onGroupSignal`/`onIncomingChat` slots at `conversation.ts:370-372`).
2. Recognize `"typing"` envelopes **only** inside the existing "open contact" branch of `poll()` (near where `timer`/`file-opened` are handled, `conversation.ts:435-439`) - reset the idle timer and flip typing state true, then call `onTypingSignal?.()`. Do **not** add any handling in the "not open contact" buffered branch - a typing signal from an unopened sender must be silently dropped, exactly like calls/timer/file-opened already are (`conversation.ts:415-419`), so it can never be used to probe whether that contact's client is even online.
3. Never persist a `"typing"` envelope into `messages` or any store - it only ever flows through the in-memory pub/sub from task 2.

## Correction made during implementation

Dropped the planned `onTypingSignal?: () => void` parameter on `poll()` - with the pub/sub already living in `conversation.ts` itself (task 2), `poll()`'s "typing" branch just calls the internal `handleTypingSignal()` directly instead of also threading a passthrough callback through every call site for no behavioral difference. `screens/Conversation.tsx` (phase 3) subscribes straight to the exported `subscribeToTypingState`, matching how `call.ts`'s consumers already subscribe to `subscribeToCallState` without `poll()` needing a dedicated call-signal callback parameter either... except `poll()` *does* already take `onCallSignal` (a real behavioral hook: `App.tsx` routes it into `call.ts`'s own state machine in a different module). Typing has no cross-module hook to make - `handleTypingSignal`, the pub/sub, and the idle timer are all local to `conversation.ts` - so the extra parameter would have been pure boilerplate. Also added `resetTypingState()` (exported) for phase 3 to call when leaving a conversation, not in the original task list but needed so a stale "is typing" can't bleed into the next contact opened.

`e2e-typing-signal.mjs` (no UI exists yet to drive this phase's behavior through, so it exercises the real exported functions directly via a dynamic `import("/src/chat/conversation.ts")`) initially tried to subscribe on one page while relying on the app's own background `poll()` loop (a separate module instance) to trigger it - this silently never worked: Vite's dev server appends a cache-busting `?t=<mtime>` query to statically-analyzed imports (what `App.tsx` uses) but not to a raw dynamically-`import()`-ed literal path, so the two resolve to different browser-level module records with independent module-level state, even though both serve the same source file. Fixed by driving `poll()` directly from the same dynamically-imported instance the test subscribes to, rather than depending on the real app's background poll - this is still the real, exported `poll()` function, just invoked directly instead of indirectly through React's effect loop.

## Test acceptance criteria

| Task | Acceptance criteria                                                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1... | `sendTypingSignal` produces an encrypted envelope indistinguishable in transport shape from any other envelope type (opaque ciphertext server-side) |
| 2... | Subscribing to the typing-state pub/sub receives a true/false transition; the state auto-clears to false if no signal arrives within the idle window, without needing an explicit "stop" signal |
| 3... | A typing signal from a sender whose conversation is NOT currently open never triggers `onTypingSignal` and never appears in any persisted store - verified directly (not just that the open-conversation UI doesn't show it) |
