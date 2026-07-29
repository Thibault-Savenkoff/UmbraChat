import type { SignalStore } from "wasm-crypto";
import type { LocalAccount } from "../storage/keyStore";
import { openStore, persistSession, restoreSession } from "../crypto/session";
import { fetchPrekeyBundle } from "../api/prekeyBundle";
import { sendMessage, fetchMessages } from "../api/messages";
import { listDevices } from "../api/devices";
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
  data: number[];
}

interface ReceiptEnvelope {
  type: "delivered" | "read";
  refId: string;
}

interface TimerEnvelope {
  type: "timer";
  seconds: number;
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

type Envelope = TextEnvelope | FileEnvelope | ReceiptEnvelope | TimerEnvelope | CallEnvelope;

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
async function sendToContact(contactId: string, plaintext: Uint8Array, account: LocalAccount, store: SignalStore): Promise<void> {
  const devices = await listDevices(contactId, account);
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

export const MAX_FILE_BYTES = 8 * 1024 * 1024;

export function isFileTooLarge(file: File): boolean {
  return file.size > MAX_FILE_BYTES;
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

export async function sendFile(
  contactId: string,
  file: File,
  account: LocalAccount,
  store: SignalStore,
  onStage: (stage: FileSendStage) => void,
): Promise<ChatMessage[]> {
  onStage("encrypting");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const envelope: FileEnvelope = {
    type: "file",
    id: crypto.randomUUID(),
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    data: Array.from(bytes),
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
  });
  await saveMessages(contactId, messages);
  onStage("sent");
  return messages;
}

/**
 * Fetches and decrypts any pending messages, updates local history, and
 * replies with receipts. ponytail: delivered and read are sent together as
 * soon as a text message is decrypted, since polling only happens while the
 * conversation screen is open - there's no background-delivery state yet to
 * tell the two apart. Split them once there's a reason to. Files don't get
 * delivered/read receipts at all yet - only text does; add them if file
 * status tracking turns out to matter.
 */
export async function poll(
  contactId: string,
  account: LocalAccount,
  store: SignalStore,
  onCallSignal?: (envelope: CallEnvelope) => Promise<void>,
): Promise<ChatMessage[]> {
  const received = await fetchMessages(account);
  const messages = await loadMessages(contactId);

  for (const message of received) {
    if (message.senderAccountId !== contactId) {
      // ponytail: GET /v1/messages is fetch-and-delete server-side, so a message
      // from anyone but the open conversation partner is gone the moment we see
      // it here - there's no per-contact fetch, and no multi-conversation UI yet
      // to route it to. Upgrade: server-side per-sender fetch, or a contacts
      // list that keeps every contact's poll loop alive, not just the open one.
      console.warn(`dropped a message from ${message.senderAccountId}: no open conversation for that sender`);
      continue;
    }

    const key = sessionKey(message.senderAccountId, message.senderDeviceId);
    await restoreSession(store, key);
    const plaintext = store.decrypt(key, message.envelope);
    const envelope = JSON.parse(new TextDecoder().decode(plaintext)) as Envelope;

    if (isCallEnvelope(envelope)) {
      await onCallSignal?.(envelope);
    } else if (envelope.type === "text") {
      const timerSeconds = getTimerSeconds(contactId);
      messages.push({
        id: envelope.id,
        direction: "received",
        text: envelope.body,
        status: "delivered",
        createdAt: message.createdAt,
        // Receiving while the conversation is open is already this app's "read"
        // moment (see the receipt loop below), so the expiry clock starts now.
        ...(timerSeconds > 0 ? { expiresAt: new Date(Date.now() + timerSeconds * 1000).toISOString() } : {}),
      });

      for (const type of ["delivered", "read"] as const) {
        const receipt: ReceiptEnvelope = { type, refId: envelope.id };
        await sendToContact(contactId, new TextEncoder().encode(JSON.stringify(receipt)), account, store);
      }
    } else if (envelope.type === "file") {
      messages.push({
        id: envelope.id,
        direction: "received",
        text: "",
        status: "delivered",
        createdAt: message.createdAt,
        file: { filename: envelope.filename, mimeType: envelope.mimeType, size: envelope.size, bytes: Uint8Array.from(envelope.data) },
      });
    } else if (envelope.type === "timer") {
      setTimerSecondsLocal(contactId, envelope.seconds);
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

  const now = Date.now();
  const alive = messages.filter((m) => !m.expiresAt || new Date(m.expiresAt).getTime() > now);

  if (received.length > 0 || alive.length !== messages.length) await saveMessages(contactId, alive);
  return alive;
}
