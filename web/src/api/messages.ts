import type { LocalAccount } from "../storage/keyStore";
import { signedFetch } from "./signedRequest";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

export async function sendMessage(recipientAccountId: string, envelope: Uint8Array, account: LocalAccount): Promise<void> {
  const response = await signedFetch("/v1/messages", "POST", account, {
    recipient_account_id: recipientAccountId,
    ciphertext: toBase64(envelope),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "failed to send message" }));
    throw new Error(error.error ?? "failed to send message");
  }
}

export interface ReceivedMessage {
  senderAccountId: string;
  envelope: Uint8Array;
  createdAt: string;
}

export async function fetchMessages(account: LocalAccount): Promise<ReceivedMessage[]> {
  const response = await signedFetch("/v1/messages", "GET", account);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "failed to fetch messages" }));
    throw new Error(error.error ?? "failed to fetch messages");
  }

  const raw = (await response.json()) as { sender_account_id: string; ciphertext: string; created_at: string }[];
  return raw.map((m) => ({ senderAccountId: m.sender_account_id, envelope: fromBase64(m.ciphertext), createdAt: m.created_at }));
}
