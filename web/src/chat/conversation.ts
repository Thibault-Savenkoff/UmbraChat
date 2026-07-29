import type { SignalStore } from "wasm-crypto";
import type { LocalAccount } from "../storage/keyStore";
import { openStore, persistSession } from "../crypto/session";
import { fetchPrekeyBundle } from "../api/prekeyBundle";
import { sendMessage, fetchMessages } from "../api/messages";
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

type Envelope = TextEnvelope | FileEnvelope | ReceiptEnvelope | TimerEnvelope;

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
  const ciphertext = store.encrypt(contactId, new TextEncoder().encode(JSON.stringify(envelope)));
  await sendMessage(contactId, ciphertext, account);
  await persistSession(store, contactId);
  setTimerSecondsLocal(contactId, seconds);
}

/** Opens the local store, restoring any persisted session, and establishes one with the contact if needed. */
export async function startConversation(contactId: string, account: LocalAccount): Promise<SignalStore> {
  const store = await openStore(account.identity, contactId);
  if (!store.has_session(contactId)) {
    const bundle = await fetchPrekeyBundle(contactId, account);
    store.establish_session(contactId, bundle);
    await persistSession(store, contactId);
  }
  return store;
}

export async function sendText(contactId: string, text: string, account: LocalAccount, store: SignalStore): Promise<ChatMessage[]> {
  const envelope: TextEnvelope = { type: "text", id: crypto.randomUUID(), body: text };
  const plaintext = new TextEncoder().encode(JSON.stringify(envelope));
  const ciphertext = store.encrypt(contactId, plaintext);

  await sendMessage(contactId, ciphertext, account);
  await persistSession(store, contactId);

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
  const plaintext = new TextEncoder().encode(JSON.stringify(envelope));
  const ciphertext = store.encrypt(contactId, plaintext);

  onStage("sending");
  await sendMessage(contactId, ciphertext, account);
  await persistSession(store, contactId);

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
export async function poll(contactId: string, account: LocalAccount, store: SignalStore): Promise<ChatMessage[]> {
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

    const plaintext = store.decrypt(contactId, message.envelope);
    const envelope = JSON.parse(new TextDecoder().decode(plaintext)) as Envelope;

    if (envelope.type === "text") {
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
        const receiptCiphertext = store.encrypt(contactId, new TextEncoder().encode(JSON.stringify(receipt)));
        await sendMessage(contactId, receiptCiphertext, account);
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

    await persistSession(store, contactId);
  }

  const now = Date.now();
  const alive = messages.filter((m) => !m.expiresAt || new Date(m.expiresAt).getTime() > now);

  if (received.length > 0 || alive.length !== messages.length) await saveMessages(contactId, alive);
  return alive;
}
