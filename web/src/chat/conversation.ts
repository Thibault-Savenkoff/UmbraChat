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

interface ReceiptEnvelope {
  type: "delivered" | "read";
  refId: string;
}

type Envelope = TextEnvelope | ReceiptEnvelope;

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
  messages.push({ id: envelope.id, direction: "sent", text, status: "sent", createdAt: new Date().toISOString() });
  await saveMessages(contactId, messages);
  return messages;
}

/**
 * Fetches and decrypts any pending messages, updates local history, and
 * replies with receipts. ponytail: delivered and read are sent together as
 * soon as a text message is decrypted, since polling only happens while the
 * conversation screen is open - there's no background-delivery state yet to
 * tell the two apart. Split them once there's a reason to.
 */
export async function poll(contactId: string, account: LocalAccount, store: SignalStore): Promise<ChatMessage[]> {
  const received = await fetchMessages(account);
  let messages = await loadMessages(contactId);

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
      messages.push({ id: envelope.id, direction: "received", text: envelope.body, status: "delivered", createdAt: message.createdAt });

      for (const type of ["delivered", "read"] as const) {
        const receipt: ReceiptEnvelope = { type, refId: envelope.id };
        const receiptCiphertext = store.encrypt(contactId, new TextEncoder().encode(JSON.stringify(receipt)));
        await sendMessage(contactId, receiptCiphertext, account);
      }
    } else {
      const target = messages.find((m) => m.id === envelope.refId && m.direction === "sent");
      if (target) target.status = envelope.type;
    }

    await persistSession(store, contactId);
  }

  if (received.length > 0) await saveMessages(contactId, messages);
  return messages;
}
