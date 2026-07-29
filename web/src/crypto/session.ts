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

/** Rebuilds the store from the local identity. Sessions are restored lazily per
 * device key via `restoreSession`, not eagerly here - which devices exist for a
 * contact isn't known until their device list is fetched. */
export async function openStore(identity: IdentityBundle): Promise<SignalStore> {
  await ensureInit();
  return new SignalStore(identity);
}

/** Persists `key`'s current session state - call after establish_session/encrypt/decrypt. */
export async function persistSession(store: SignalStore, key: string): Promise<void> {
  const bytes = store.export_session(key);
  if (bytes) await saveSession(key, bytes);
}

/** Restores a previously persisted session for `key` into the store, if one exists and isn't already loaded. */
export async function restoreSession(store: SignalStore, key: string): Promise<void> {
  if (store.has_session(key)) return;
  const session = await loadSession(key);
  if (session) store.import_session(key, session);
}
