import type { IdentityBundle } from "../crypto/identity";
import { identityBundleToJson } from "./codec";

// Same-origin by default - Vite's dev proxy (see vite.config.ts) forwards
// /v1 to the Rust server, which keeps this working over HTTPS without
// mixed-content blocking (matches api/signedRequest.ts). VITE_API_BASE
// overrides it for a real deploy where the API isn't co-located.
export const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export interface RegisteredAccount {
  accountId: string;
  deviceId: string;
}

export async function registerAccount(identity: IdentityBundle): Promise<RegisteredAccount> {
  const response = await fetch(`${API_BASE}/v1/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(identityBundleToJson(identity)),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "registration failed" }));
    throw new Error(error.error ?? "registration failed");
  }

  const { account_id, device_id } = (await response.json()) as { account_id: string; device_id: string };
  return { accountId: account_id, deviceId: device_id };
}
