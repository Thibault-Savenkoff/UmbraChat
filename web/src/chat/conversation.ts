import type { SignalStore } from "wasm-crypto";
import type { LocalAccount } from "../storage/keyStore";
import { openStore, persistSession, restoreSession } from "../crypto/session";
import { fetchPrekeyBundle } from "../api/prekeyBundle";
import { sendMessage, fetchMessages } from "../api/messages";
import { listDevices } from "../api/devices";
import { toBase64, fromBase64 } from "../api/codec";
import { loadMessages, saveMessages, type ChatMessage } from "../storage/messageStore";

interface TextEnvelope {
  type: "text";
  id: string;
  body: string;
}

interface FileEnvelope {
  type: "file";
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  // base64, not a JSON array of numbers - a plain number[] blows up to ~3.5x
  // the raw size once JSON-stringified (each byte becomes 1-3 ASCII digits
  // plus a comma), on top of the outer request's own base64 layer. That
  // compounded a file well under MAX_FILE_BYTES into a wire payload that
  // could exceed the server's body limit, with the client stuck waiting on
  // an upload that could never finish - this is what "stuck in sending"
  // actually was. base64 keeps the expansion to the ~1.33x the size budget
  // (MAX_FILE_BYTES vs the server's MAX_BODY_BYTES) always assumed.
  data: string;
  destructOnOpen?: boolean;
  timerSeconds?: number;
}

interface ReceiptEnvelope {
  type: "delivered" | "read";
  refId: string;
}

interface FileOpenedEnvelope {
  type: "file-opened";
  refId: string;
}

interface TimerEnvelope {
  type: "timer";
  seconds: number;
}

interface TypingEnvelope {
  type: "typing";
}

export interface CallOfferEnvelope {
  type: "call-offer";
  callId: string;
  kind: "voice" | "video";
  sdp: string;
}

export interface CallAnswerEnvelope {
  type: "call-answer";
  callId: string;
  sdp: string;
}

export interface CallIceEnvelope {
  type: "call-ice";
  callId: string;
  candidate: RTCIceCandidateInit;
}

export interface CallEndEnvelope {
  type: "call-end";
  callId: string;
  reason: "hangup" | "declined" | "cancelled" | "timeout" | "failed";
}

export type CallEnvelope = CallOfferEnvelope | CallAnswerEnvelope | CallIceEnvelope | CallEndEnvelope;

function isCallEnvelope(envelope: Envelope): envelope is CallEnvelope {
  return envelope.type === "call-offer" || envelope.type === "call-answer" || envelope.type === "call-ice" || envelope.type === "call-end";
}

export interface GroupInviteEnvelope {
  type: "group-invite";
  groupId: string;
  name: string;
  memberAccountIds: string[];
}

export interface GroupUpdateEnvelope {
  type: "group-update";
  groupId: string;
  memberAccountIds: string[];
}

export interface GroupTextEnvelope {
  type: "group-text";
  groupId: string;
  id: string;
  body: string;
}

export type GroupEnvelope = GroupInviteEnvelope | GroupUpdateEnvelope | GroupTextEnvelope;

export function isGroupEnvelope(envelope: Envelope): envelope is GroupEnvelope {
  return envelope.type === "group-invite" || envelope.type === "group-update" || envelope.type === "group-text";
}

type Envelope = TextEnvelope | FileEnvelope | ReceiptEnvelope | FileOpenedEnvelope | TimerEnvelope | TypingEnvelope | CallEnvelope | GroupEnvelope;

/** The composite session address a contact's specific device is addressed by.
 * `wasm-crypto` treats this as an opaque string name (its own device_id field
 * stays hardcoded at 1) - two different devices are just two different names,
 * no Rust/WASM changes needed for multi-device. See the plan's Decisions. */
function sessionKey(contactAccountId: string, deviceId: string): string {
  return `${contactAccountId}:${deviceId}`;
}

/**
 * Fans an envelope out to every one of `contactId`'s current devices,
 * establishing a session with any device that doesn't have one yet.
 * Every send site in this module routes through here - one place that knows
 * how to reach "a contact," not one per envelope type. Re-fetches the device
 * list on every call rather than caching it, so a contact's newly linked
 * device is included in the very next send with no extra wiring.
 */
export async function sendToContact(contactId: string, plaintext: Uint8Array, account: LocalAccount, store: SignalStore): Promise<void> {
  const devices = await listDevices(contactId, account);
  // list_devices returns an empty array rather than 404ing for an unknown
  // account (see server/src/routes/devices.rs), so an empty list here would
  // otherwise loop zero times and silently "succeed" without sending anything -
  // a real regression from the old single-device flow, which validated the
  // contact existed (via a 404) before any message could be typed.
  if (devices.length === 0) throw new Error("this contact has no reachable devices");
  for (const device of devices) {
    const key = sessionKey(contactId, device.id);
    await restoreSession(store, key);
    if (!store.has_session(key)) {
      const bundle = await fetchPrekeyBundle(device.id, account);
      store.establish_session(key, bundle);
    }
    const ciphertext = store.encrypt(key, plaintext);
    await sendMessage(device.id, ciphertext, account);
    await persistSession(store, key);
  }
}

/** Sends a call-signaling envelope through the same encrypted pipe as everything else - never shown as a chat message. */
export async function sendCallSignal(contactId: string, envelope: CallEnvelope, account: LocalAccount, store: SignalStore): Promise<void> {
  await sendToContact(contactId, new TextEncoder().encode(JSON.stringify(envelope)), account, store);
}

/**
 * Sends a "typing" ping through the same encrypted pipe as everything else -
 * never persisted, never shown as a chat message. Callers (the composer, see
 * screens/Conversation.tsx) are responsible for debouncing and for only
 * calling this while the typing-indicator preference is on.
 */
export async function sendTypingSignal(contactId: string, account: LocalAccount, store: SignalStore): Promise<void> {
  const envelope: TypingEnvelope = { type: "typing" };
  await sendToContact(contactId, new TextEncoder().encode(JSON.stringify(envelope)), account, store);
}

// A polled transport has no delivery guarantee for an explicit "stopped
// typing" signal, so "is typing" is instead a rolling window: each incoming
// ping resets the timer, and silence for this long clears it back to false.
const TYPING_IDLE_MS = 5000;

let typingActive = false;
let typingIdleTimer: number | undefined;
const typingListeners = new Set<(active: boolean) => void>();

function setTypingActive(active: boolean): void {
  typingActive = active;
  for (const listener of typingListeners) listener(typingActive);
}

export function getTypingActive(): boolean {
  return typingActive;
}

/** Subscribes to the open contact's typing state; returns an unsubscribe function. */
export function subscribeToTypingState(listener: (active: boolean) => void): () => void {
  typingListeners.add(listener);
  return () => typingListeners.delete(listener);
}

// Only ever called from poll()'s already-open-contact branch (see poll's own
// doc comment) - a typing signal from anyone else is dropped there and never
// reaches this function, so there's no per-sender bookkeeping to do here.
function handleTypingSignal(): void {
  window.clearTimeout(typingIdleTimer);
  setTypingActive(true);
  typingIdleTimer = window.setTimeout(() => setTypingActive(false), TYPING_IDLE_MS);
}

/** Clears typing state immediately - call when leaving a conversation so a
 * stale "is typing" doesn't bleed into whichever contact is opened next. */
export function resetTypingState(): void {
  window.clearTimeout(typingIdleTimer);
  setTypingActive(false);
}

export const MAX_FILE_BYTES = 8 * 1024 * 1024;

export function isFileTooLarge(file: File): boolean {
  return file.size > MAX_FILE_BYTES;
}

/**
 * Re-encodes any image that isn't already JPEG/WebP into WebP before it's
 * sent - fixes two things at once: phone camera formats like HEIC render as
 * a plain download link everywhere except Safari (no <img> support), and
 * they're frequently bigger than MAX_FILE_BYTES, so shrinking here also
 * means fewer "too large" rejections. Canvas + createImageBitmap are native,
 * evergreen-browser APIs - no image library needed for a single re-encode.
 */
async function normalizeImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/jpeg" || file.type === "image/webp") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  } catch {
    // Some inputs createImageBitmap can't decode at all - send the original
    // rather than blocking the send outright.
    return file;
  }
}

function timerKey(contactId: string): string {
  return `umbrachat:timer:${contactId}`;
}

/** 0 means off - matches the default when nothing has been set yet. */
export function getTimerSeconds(contactId: string): number {
  return Number(localStorage.getItem(timerKey(contactId)) ?? 0);
}

function setTimerSecondsLocal(contactId: string, seconds: number): void {
  localStorage.setItem(timerKey(contactId), String(seconds));
}

export async function setDisappearingTimer(contactId: string, seconds: number, account: LocalAccount, store: SignalStore): Promise<void> {
  const envelope: TimerEnvelope = { type: "timer", seconds };
  await sendToContact(contactId, new TextEncoder().encode(JSON.stringify(envelope)), account, store);
  setTimerSecondsLocal(contactId, seconds);
}

/** Opens the local store. Sessions are established lazily per device inside
 * `sendToContact`/`poll`, so there's nothing left for this to do eagerly. */
export async function startConversation(_contactId: string, account: LocalAccount): Promise<SignalStore> {
  return openStore(account.identity);
}

export async function sendText(contactId: string, text: string, account: LocalAccount, store: SignalStore): Promise<ChatMessage[]> {
  const envelope: TextEnvelope = { type: "text", id: crypto.randomUUID(), body: text };
  await sendToContact(contactId, new TextEncoder().encode(JSON.stringify(envelope)), account, store);

  const messages = await loadMessages(contactId);
  const timerSeconds = getTimerSeconds(contactId);
  messages.push({
    id: envelope.id,
    direction: "sent",
    text,
    status: "sent",
    createdAt: new Date().toISOString(),
    ...(timerSeconds > 0 ? { timerSeconds } : {}),
  });
  await saveMessages(contactId, messages);
  return messages;
}

export type FileSendStage = "encrypting" | "sending" | "sent";
export type FileDestruct = { onOpen: true } | { afterSeconds: number };

export async function sendFile(
  contactId: string,
  file: File,
  account: LocalAccount,
  store: SignalStore,
  onStage: (stage: FileSendStage) => void,
  destruct?: FileDestruct,
): Promise<ChatMessage[]> {
  onStage("encrypting");
  const normalized = await normalizeImage(file);
  if (isFileTooLarge(normalized)) throw new Error(`${normalized.name} is too large (max 8MB) even after compression`);
  const bytes = new Uint8Array(await normalized.arrayBuffer());
  const envelope: FileEnvelope = {
    type: "file",
    id: crypto.randomUUID(),
    filename: normalized.name,
    mimeType: normalized.type || "application/octet-stream",
    size: normalized.size,
    data: toBase64(bytes),
    ...(destruct && "onOpen" in destruct ? { destructOnOpen: true } : {}),
    ...(destruct && "afterSeconds" in destruct ? { timerSeconds: destruct.afterSeconds } : {}),
  };

  onStage("sending");
  await sendToContact(contactId, new TextEncoder().encode(JSON.stringify(envelope)), account, store);

  const messages = await loadMessages(contactId);
  messages.push({
    id: envelope.id,
    direction: "sent",
    text: "",
    status: "sent",
    createdAt: new Date().toISOString(),
    file: { filename: envelope.filename, mimeType: envelope.mimeType, size: envelope.size, bytes },
    ...(destruct && "onOpen" in destruct ? { destructOnOpen: true } : {}),
    // Pegged to send time, not read time: a timed file must vanish on schedule
    // even if the recipient never opens it, unlike disappearing text messages.
    ...(destruct && "afterSeconds" in destruct ? { expiresAt: new Date(Date.now() + destruct.afterSeconds * 1000).toISOString() } : {}),
  });
  await saveMessages(contactId, messages);
  onStage("sent");
  return messages;
}

/**
 * Reports back that a received file was opened - always, for the sender's
 * visibility, regardless of destruct mode - and, if it was on-open, deletes it
 * from local storage immediately rather than waiting for the next poll's sweep.
 */
export async function markFileOpened(contactId: string, messageId: string, account: LocalAccount, store: SignalStore): Promise<ChatMessage[]> {
  const receipt: FileOpenedEnvelope = { type: "file-opened", refId: messageId };
  await sendToContact(contactId, new TextEncoder().encode(JSON.stringify(receipt)), account, store);

  const messages = await loadMessages(contactId);
  const target = messages.find((m) => m.id === messageId);
  if (!target?.destructOnOpen) return messages;

  const remaining = messages.filter((m) => m.id !== messageId);
  await saveMessages(contactId, remaining);
  return remaining;
}

/**
 * Sends "read" receipts for received messages in `contactId`'s local history
 * that only have a "delivered" one so far - call this when the user actually
 * opens that conversation, not the moment a message is buffered while it's
 * still closed. Security fix: a message from a sender other than the open
 * contact used to get both delivered *and* read sent back the instant the
 * background poll decrypted it, regardless of whether anyone had looked at
 * anything - that turned "read" into a presence oracle (a sender who only
 * knows the target's account id could probe for exactly when their device is
 * unlocked/foregrounded, with no accept step and no way to suppress it).
 * "Delivered" alone is left automatic; it only confirms a client is polling
 * at all, a much coarser signal already close to what device listing already
 * exposes - "read" now means a person actually opened the conversation.
 */
export async function markConversationRead(contactId: string, account: LocalAccount, store: SignalStore): Promise<ChatMessage[]> {
  const messages = await loadMessages(contactId);
  let changed = false;
  for (const m of messages) {
    if (m.direction !== "received" || m.status !== "delivered") continue;
    const receipt: ReceiptEnvelope = { type: "read", refId: m.id };
    await sendToContact(contactId, new TextEncoder().encode(JSON.stringify(receipt)), account, store);
    m.status = "read";
    changed = true;
  }
  if (changed) await saveMessages(contactId, messages);
  return messages;
}

function buildReceivedTextMessage(envelope: TextEnvelope, createdAt: string, timerSeconds: number): ChatMessage {
  return {
    id: envelope.id,
    direction: "received",
    text: envelope.body,
    status: "delivered",
    createdAt,
    // Decrypting is already this app's "read" moment (see the receipt loop
    // wherever this is called from), so the expiry clock starts now.
    ...(timerSeconds > 0 ? { expiresAt: new Date(Date.now() + timerSeconds * 1000).toISOString() } : {}),
  };
}

function buildReceivedFileMessage(envelope: FileEnvelope, createdAt: string): ChatMessage {
  return {
    id: envelope.id,
    direction: "received",
    text: "",
    status: "delivered",
    createdAt,
    file: { filename: envelope.filename, mimeType: envelope.mimeType, size: envelope.size, bytes: fromBase64(envelope.data) },
    ...(envelope.destructOnOpen ? { destructOnOpen: true } : {}),
    ...(envelope.timerSeconds ? { expiresAt: new Date(Date.now() + envelope.timerSeconds * 1000).toISOString() } : {}),
  };
}

/**
 * Fetches and decrypts any pending messages, updates local history, and
 * replies with receipts. A text/file message from a sender other than the
 * currently open contact - including a first-ever message from someone new -
 * is still saved into that sender's own local history and reported via
 * `onIncomingChat`, rather than dropped: `GET /v1/messages` is fetch-and-
 * delete server-side, so this is the only chance to keep it. Everything else
 * (call signals, timers, receipts) only makes sense inside an already-open
 * conversation with that sender and is dropped if it's not open.
 *
 * Receipts: for the currently open contact, delivered and read fire together
 * as soon as a text message is decrypted, since the user is actively looking
 * at that conversation right now. For anyone else, only "delivered" fires
 * here - "read" is deferred to `markConversationRead`, called once the user
 * actually opens that conversation (see its doc comment for why: sending
 * "read" automatically for an unopened sender was a presence oracle). Files
 * don't get delivered/read receipts at all yet - only text does; add them if
 * file status tracking turns out to matter.
 */
export async function poll(
  contactId: string | undefined,
  account: LocalAccount,
  store: SignalStore,
  onCallSignal?: (envelope: CallEnvelope) => Promise<void>,
  onGroupSignal?: (envelope: GroupEnvelope, senderAccountId: string) => Promise<void>,
  onIncomingChat?: (senderAccountId: string) => void,
): Promise<ChatMessage[]> {
  const received = await fetchMessages(account);
  const messages = contactId ? await loadMessages(contactId) : [];
  // Local history for senders other than the open contact, loaded lazily
  // since a single poll can surface messages from several new senders at once.
  const otherSenderMessages = new Map<string, ChatMessage[]>();
  async function bucketFor(senderId: string): Promise<ChatMessage[]> {
    if (!otherSenderMessages.has(senderId)) otherSenderMessages.set(senderId, await loadMessages(senderId));
    return otherSenderMessages.get(senderId)!;
  }

  for (const message of received) {
    // Every message is decrypted regardless of sender, *before* deciding
    // whether it's for the open 1:1 conversation - a group message can arrive
    // from any member, not just whichever contact happens to be open, so the
    // old sender-must-match filter would silently drop it if checked first.
    // Side effect, not the point: this also fixes a latent bug where a message
    // from a non-open sender was never decrypted at all, permanently desyncing
    // that sender's local ratchet from the one they hold.
    const key = sessionKey(message.senderAccountId, message.senderDeviceId);
    await restoreSession(store, key);
    const plaintext = store.decrypt(key, message.envelope);
    const envelope = JSON.parse(new TextDecoder().decode(plaintext)) as Envelope;

    if (isGroupEnvelope(envelope)) {
      await onGroupSignal?.(envelope, message.senderAccountId);
      await persistSession(store, key);
      continue;
    }

    if (!contactId || message.senderAccountId !== contactId) {
      if (envelope.type === "text") {
        const bucket = await bucketFor(message.senderAccountId);
        bucket.push(buildReceivedTextMessage(envelope, message.createdAt, getTimerSeconds(message.senderAccountId)));
        // "delivered" only, not "read" - see markConversationRead's doc comment.
        const receipt: ReceiptEnvelope = { type: "delivered", refId: envelope.id };
        await sendToContact(message.senderAccountId, new TextEncoder().encode(JSON.stringify(receipt)), account, store);
        onIncomingChat?.(message.senderAccountId);
      } else if (envelope.type === "file") {
        const bucket = await bucketFor(message.senderAccountId);
        bucket.push(buildReceivedFileMessage(envelope, message.createdAt));
        onIncomingChat?.(message.senderAccountId);
      } else {
        // Calls/timer/file-opened/receipts only make sense inside an already-
        // open conversation with that sender - nothing to update if it's not.
        console.warn(`dropped a ${envelope.type} envelope from ${message.senderAccountId}: no open conversation for that sender`);
      }
      await persistSession(store, key);
      continue;
    }

    if (isCallEnvelope(envelope)) {
      await onCallSignal?.(envelope);
    } else if (envelope.type === "text") {
      messages.push(buildReceivedTextMessage(envelope, message.createdAt, getTimerSeconds(contactId)));

      for (const type of ["delivered", "read"] as const) {
        const receipt: ReceiptEnvelope = { type, refId: envelope.id };
        await sendToContact(contactId, new TextEncoder().encode(JSON.stringify(receipt)), account, store);
      }
    } else if (envelope.type === "file") {
      messages.push(buildReceivedFileMessage(envelope, message.createdAt));
    } else if (envelope.type === "timer") {
      setTimerSecondsLocal(contactId, envelope.seconds);
    } else if (envelope.type === "file-opened") {
      const target = messages.find((m) => m.id === envelope.refId && m.direction === "sent");
      if (target) target.status = "opened";
    } else if (envelope.type === "typing") {
      handleTypingSignal();
    } else {
      const target = messages.find((m) => m.id === envelope.refId && m.direction === "sent");
      if (target) {
        target.status = envelope.type;
        if (envelope.type === "read" && target.timerSeconds && !target.expiresAt) {
          target.expiresAt = new Date(Date.now() + target.timerSeconds * 1000).toISOString();
        }
      }
    }

    await persistSession(store, key);
  }

  for (const [senderId, msgs] of otherSenderMessages) {
    await saveMessages(senderId, msgs);
  }

  const now = Date.now();
  const alive = messages.filter((m) => !m.expiresAt || new Date(m.expiresAt).getTime() > now);

  if (contactId && (received.length > 0 || alive.length !== messages.length)) await saveMessages(contactId, alive);
  return alive;
}
