---
status: pending
---

# Instruction: Group envelopes, local roster, fan-out send/receive

## Architecture projection

> Tree of the final files. ✅ create · ✏️ modify · ❌ delete

```txt
.
└── web/
    └── src/
        ├── chat/
        │   ├── conversation.ts   ✏️
        │   └── group.ts          ✅
        └── storage/
            ├── groupStore.ts     ✅
            └── messageStore.ts   ✏️
```

## User Journey

```mermaid
flowchart TD
  A[Creator picks members + a name] --> B[group-invite fanned out to every member via sendToContact]
  B --> C[Each member's client saves the roster locally on receipt]
  D[Any member sends a group text] --> E[group-text fanned out to every OTHER current member in my roster]
  E --> F[Recipient checks: is the sender still in MY roster for this group?]
  F -->|yes| G[Shown, tagged with who sent it]
  F -->|no| H[Dropped - the removal enforcement]
  I[A member removes another] --> J[group-update, new roster, fanned out to the NEW roster only]
  J --> K[The removed member never receives it - stops getting anything new]
```

## Tasks to do

### 1) Group envelope types, exported for reuse

1. `chat/conversation.ts`: add `GroupInviteEnvelope { type: "group-invite", groupId, name, memberAccountIds: string[] }`, `GroupUpdateEnvelope { type: "group-update", groupId, memberAccountIds: string[] }`, `GroupTextEnvelope { type: "group-text", groupId, id, body }` to the `Envelope` union; export a `GroupEnvelope` union and `isGroupEnvelope` predicate (mirrors `CallEnvelope`/`isCallEnvelope`)
2. `chat/conversation.ts`: export the existing private `sendToContact` - `chat/group.ts` reuses it directly for per-member fan-out rather than reimplementing per-device session/establish/encrypt/send/persist logic

### 2) `poll()` decrypts before filtering by sender

> A group message can arrive from *any* member, not just "the contact this conversation happens to be open with" - the existing sender-mismatch drop-filter runs before decryption today, which would silently drop every group message whose sender isn't the one 1:1 contact currently open.

1. `chat/conversation.ts::poll`: decrypt every received message first, regardless of sender, *then* branch: a group envelope always routes to a new `onGroupSignal?: (envelope: GroupEnvelope, senderAccountId: string) => Promise<void>` callback (added alongside the existing `onCallSignal`); anything else keeps today's sender-must-match-`contactId` drop-filter before further handling. Side effect worth noting, not the point of this change: this also fixes a latent bug where a message from a sender other than the open contact was never decrypted at all, permanently desyncing that sender's local ratchet from the version they hold - see the existing "gone the moment we see it here" ponytail comment this touches

### 3) Local roster storage

1. `storage/groupStore.ts` (new): `Group { id: string; name: string; memberAccountIds: string[]; createdAt: string }`; `loadGroup(groupId)`, `saveGroup(group)`, `loadAllGroups()` (IndexedDB, same shape as `messageStore.ts`)
2. `storage/messageStore.ts`: add optional `senderAccountId?: string` to `ChatMessage` - only populated for *received* group messages, to say which member sent it (a 1:1 conversation's sender is already implicit from context)

### 4) `chat/group.ts`: create, send, receive, remove

1. `createGroup(name, memberAccountIds, account, store)`: generates a `groupId`, saves the roster locally (`memberAccountIds` excludes the caller, same convention `contactId` already uses), fans out a `group-invite` to every member via `sendToContact`
2. `sendGroupText(groupId, text, account, store)`: loads the local roster, fans out a `group-text` to every current member, saves the caller's own sent copy locally
3. `removeMember(groupId, memberAccountId, account, store)`: updates the local roster (member removed), fans out `group-update` with the new roster to the new roster only - the removed member is never sent it
4. `handleGroupSignal(envelope, senderAccountId, account, store)` (the `onGroupSignal` callback): `group-invite` saves a new local group; `group-update` overwrites the local roster (and if the caller's own account is no longer in it, the group is left in local storage but no longer actionable - out of scope to actively purge it, matches how removed contacts aren't purged elsewhere either); `group-text` is appended to that group's local history *only if* `senderAccountId` is still present in the local roster for that `groupId` - the removal-enforcement check

## Test acceptance criteria

| Task | Acceptance criteria              |
| ---- | -------------------------------- |
| 4 | Creating a group with 2 other members and sending a text: both members receive and can decrypt it |
| 4 | Removing a member: a text sent afterward reaches only the remaining members, not the removed one |
| 4 | A `group-text` claiming to be from a member who was already removed (per the recipient's own roster) is dropped, not shown - verified by directly crafting and sending that envelope, not relying on the removed member's own client to behave |
| 2 | A message from someone other than the currently-open 1:1 contact, but tagged as a group envelope, is still processed (not dropped by the old sender-mismatch filter) |
