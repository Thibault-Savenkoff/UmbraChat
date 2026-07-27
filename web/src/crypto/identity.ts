import init, { generate_identity_bundle } from "wasm-crypto";

export interface PrekeyBundle {
  key_id: number;
  public_key: number[];
  private_key: number[];
}

export interface SignedPrekeyBundle extends PrekeyBundle {
  signature: number[];
}

export interface IdentityBundle {
  identity_public_key: number[];
  identity_private_key: number[];
  registration_id: number;
  signed_prekey: SignedPrekeyBundle;
  // Post-quantum prekey, mandatory: libsignal-protocol's session establishment
  // uses PQXDH, not classic X3DH.
  kyber_signed_prekey: SignedPrekeyBundle;
  one_time_prekeys: PrekeyBundle[];
}

let initialized: Promise<unknown> | undefined;

async function ensureInit(): Promise<void> {
  initialized ??= init();
  await initialized;
}

export async function generateIdentity(oneTimePrekeyCount = 10): Promise<IdentityBundle> {
  await ensureInit();
  return generate_identity_bundle(oneTimePrekeyCount) as IdentityBundle;
}

/**
 * ponytail: single-key fingerprint only, not Signal's real pairwise safety
 * number (which combines both parties' keys). Upgrade once contacts/sessions
 * exist and there's a second key to combine with.
 */
export async function computeSafetyNumber(identityPublicKey: number[]): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", Uint8Array.from(identityPublicKey));
  const bytes = new Uint8Array(hash);
  let digits = "";
  for (const byte of bytes) {
    digits += byte.toString().padStart(3, "0");
  }
  return digits.slice(0, 30).match(/.{1,5}/g)!.join(" ");
}
