import type { LocalAccount } from "../storage/keyStore";
import type { IdentityBundle } from "../crypto/identity";
import { signedFetch } from "./signedRequest";
import { identityBundleToJson } from "./codec";
import { API_BASE } from "./register";

export interface DeviceInfo {
  id: string;
  label: string;
  createdAt: string;
}

/** No ownership check server-side: also used to discover a contact's devices for fan-out. */
export async function listDevices(accountId: string, account: LocalAccount): Promise<DeviceInfo[]> {
  const response = await signedFetch(`/v1/accounts/${accountId}/devices`, "GET", account);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "failed to list devices" }));
    throw new Error(error.error ?? "failed to list devices");
  }
  const raw = (await response.json()) as { id: string; label: string; created_at: string }[];
  return raw.map((d) => ({ id: d.id, label: d.label, createdAt: d.created_at }));
}

export async function linkInit(account: LocalAccount): Promise<string> {
  const response = await signedFetch(`/v1/accounts/${account.accountId}/devices/link-init`, "POST", account);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "failed to start device link" }));
    throw new Error(error.error ?? "failed to start device link");
  }
  const { code } = (await response.json()) as { code: string };
  return code;
}

/** Unauthenticated - the new device has no credentials yet; the code is what authorizes this. */
export async function completeLink(accountId: string, code: string, label: string, identity: IdentityBundle): Promise<string> {
  const body = { code, label, ...identityBundleToJson(identity) };
  const response = await fetch(`${API_BASE}/v1/accounts/${accountId}/devices`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "failed to complete device link" }));
    throw new Error(error.error ?? "failed to complete device link");
  }
  const { device_id } = (await response.json()) as { device_id: string };
  return device_id;
}

export async function unlinkDevice(deviceId: string, account: LocalAccount): Promise<void> {
  const response = await signedFetch(`/v1/devices/${deviceId}`, "DELETE", account);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "failed to unlink device" }));
    throw new Error(error.error ?? "failed to unlink device");
  }
}
