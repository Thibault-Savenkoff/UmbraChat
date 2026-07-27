import type { IdentityBundle } from "../crypto/identity";

// ponytail: hardcoded dev API base, add env-based config when there's a real deploy target.
const API_BASE = "http://localhost:3000";

function toBase64(bytes: number[]): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function registerAccount(identity: IdentityBundle): Promise<string> {
  const body = {
    identity_public_key: toBase64(identity.identity_public_key),
    registration_id: identity.registration_id,
    signed_prekey: {
      key_id: identity.signed_prekey.key_id,
      public_key: toBase64(identity.signed_prekey.public_key),
      signature: toBase64(identity.signed_prekey.signature),
    },
    kyber_signed_prekey: {
      key_id: identity.kyber_signed_prekey.key_id,
      public_key: toBase64(identity.kyber_signed_prekey.public_key),
      signature: toBase64(identity.kyber_signed_prekey.signature),
    },
    one_time_prekeys: identity.one_time_prekeys.map((k) => ({
      key_id: k.key_id,
      public_key: toBase64(k.public_key),
    })),
  };

  const response = await fetch(`${API_BASE}/v1/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "registration failed" }));
    throw new Error(error.error ?? "registration failed");
  }

  const { account_id } = (await response.json()) as { account_id: string };
  return account_id;
}
