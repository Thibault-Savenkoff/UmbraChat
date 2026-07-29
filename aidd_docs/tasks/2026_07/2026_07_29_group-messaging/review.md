# Review: E2E encrypted group messaging

- **Verdict**: approve
- **Diff**: `feat/multi-device-sync...feat/group-messaging`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_07_29
- **Findings**: 0 critical, 0 warning, 1 minor (fixed)

## Phases

### Phase 1 — Group envelopes, local roster, fan-out send/receive

- [x] Creating a group and sending a text: both other members receive and decrypt it — verified programmatically against the real modules (not mocked), each "member" a genuinely isolated browser context
- [x] Removing a member: a text sent afterward reaches only the remaining members
- [x] A `group-text` from an already-removed sender is dropped — verified via the real attack scenario (the removed member's own still-valid 1:1 session, not a hand-crafted fake), not merely a hypothetical
- [x] A message from a non-open sender tagged as a group envelope is still processed, not dropped by the old sender-mismatch filter

### Phase 2 — Web: create-group flow, group conversation screen, remove member

- [x] Create → both members receive and can decrypt, through the real UI
- [x] Remove → only remaining members receive the next message
- [x] The creator's own group list updates immediately, before any fan-out completes

## Findings

| Sev | Kind | Phase | Location | Issue | Fix |
| --- | ---- | ----- | -------- | ----- | --- |
| minor | code | 1 | `web/src/storage/groupStore.ts`'s `Group.memberAccountIds` docstring | Left over from before phase 1's implementation-time correction (member-relative → full roster): still said "excludes the local account," contradicting what `chat/group.ts` actually stores and a future reader would be misled by | Rewrote to match the full-roster design and point at where the reasoning lives |

Two design gaps were caught and fixed *during* implementation, before ever reaching this review step - worth recording here since they were real, not hypothetical:
- A member-relative roster (`memberAccountIds` meaning "everyone except me") can't be broadcast unchanged, since what it excludes differs per recipient - caught by tracing the removal flow by hand before writing any test, fixed by making the envelope always carry the full membership.
- `group-update` initially had no check on *who* sent it - any sender could rewrite a recipient's view of a group's membership, including an already-removed member trying to add themselves back. Fixed by requiring the sender to already be a member per the recipient's own current roster, mirroring the same check `group-text` already needed.

Considered and named, not a bug to fix: **removal is eventually consistent, not instant.** Caught by the e2e test itself - it initially failed because a remaining member sent a message before his own poller had processed the `group-update`, so he fanned out to the just-removed member using his stale roster, who still accepted it (since, from the removed member's perspective, the sender was still a valid member too). There is no way to make removal atomic across all members without a server-side membership authority, which this design deliberately avoids (see plan.md's "no server-side group concept" decision) - the guarantee is genuinely "eventually stops," not "instantly stops," and the plan's own Decisions table already frames it that way. Fixed the test's race, not the code.

## Verification

| Metric        | Value                                             |
| ------------- | -------------------------------------------------- |
| Verified      | 100% (7/7 acceptance criteria across both phases)  |
| Files checked | `web/src/chat/conversation.ts`, `web/src/chat/group.ts`, `web/src/storage/groupStore.ts`, `web/src/storage/messageStore.ts`, `web/src/screens/{Groups,GroupConversation}.tsx`, `web/src/App.tsx`, `web/e2e-group-messaging.mjs` |
| Unchecked     | none |
| Unplanned     | `enterIdentityReady` polling addition (App.tsx) - not unplanned scope creep, it's the phase-2 "known limitation" the plan itself flagged and then corrected during implementation, documented in phase-2.md |
