import init, { SignalStore } from "wasm-crypto";
import type { IdentityBundle } from "./identity";
import { loadSession, saveSession } from "../storage/keyStore";

let initialized: Promise<unknown> | undefined;

async function ensureInit(): Promise<void> {
  initialized ??= init();
  await initialized;
}

export interface ContactBundle {
  identity_public_key: number[];
  registration_id: number;
  signed_prekey: { key_id: number; public_key: number[]; signature: number[] };
  kyber_signed_prekey: { key_id: number; public_key: number[]; signature: number[] };
  one_time_prekey?: { key_id: number; public_key: number[] };
}

/** Rebuilds the store from the local identity, restoring `contactId`'s session if one was persisted. */
export async function openStore(identity: IdentityBundle, contactId?: string): Promise<SignalStore> {
  await ensureInit();
  const store = new SignalStore(identity);
  if (contactId) {
    const session = await loadSession(contactId);
    if (session) store.import_session(contactId, session);
  }
  return store;
}

/** Persists `contactId`'s current session state - call after establish_session/encrypt/decrypt. */
export async function persistSession(store: SignalStore, contactId: string): Promise<void> {
  const bytes = store.export_session(contactId);
  if (bytes) await saveSession(contactId, bytes);
}
