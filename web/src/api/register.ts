import type { IdentityBundle } from "../crypto/identity";
import { identityBundleToJson } from "./codec";

// ponytail: hardcoded dev API base, add env-based config when there's a real deploy target.
export const API_BASE = "http://localhost:3000";

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
