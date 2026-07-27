import type { LocalAccount } from "../storage/keyStore";
import type { ContactBundle } from "../crypto/session";
import { signedFetch } from "./signedRequest";
import { fromBase64 as fromBase64Bytes } from "./codec";

function fromBase64(value: string): number[] {
  return Array.from(fromBase64Bytes(value));
}

interface RawSignedPrekey {
  key_id: number;
  public_key: string;
  signature: string;
}

interface RawBundleResponse {
  identity_public_key: string;
  registration_id: number;
  signed_prekey: RawSignedPrekey;
  kyber_signed_prekey: RawSignedPrekey;
  one_time_prekey: { key_id: number; public_key: string } | null;
}

export async function fetchPrekeyBundle(contactAccountId: string, account: LocalAccount): Promise<ContactBundle> {
  const path = `/v1/accounts/${contactAccountId}/prekey-bundle`;
  const response = await signedFetch(path, "GET", account);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "failed to fetch prekey bundle" }));
    throw new Error(error.error ?? "failed to fetch prekey bundle");
  }

  const raw = (await response.json()) as RawBundleResponse;

  return {
    identity_public_key: fromBase64(raw.identity_public_key),
    registration_id: raw.registration_id,
    signed_prekey: {
      key_id: raw.signed_prekey.key_id,
      public_key: fromBase64(raw.signed_prekey.public_key),
      signature: fromBase64(raw.signed_prekey.signature),
    },
    kyber_signed_prekey: {
      key_id: raw.kyber_signed_prekey.key_id,
      public_key: fromBase64(raw.kyber_signed_prekey.public_key),
      signature: fromBase64(raw.kyber_signed_prekey.signature),
    },
    one_time_prekey: raw.one_time_prekey
      ? { key_id: raw.one_time_prekey.key_id, public_key: fromBase64(raw.one_time_prekey.public_key) }
      : undefined,
  };
}
