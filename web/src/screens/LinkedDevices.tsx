import { useEffect, useState } from "react";
import type { LocalAccount } from "../storage/keyStore";
import { listDevices, linkInit, unlinkDevice, type DeviceInfo } from "../api/devices";

const REFRESH_INTERVAL_MS = 3000;

interface LinkedDevicesProps {
  account: LocalAccount;
}

export function LinkedDevices({ account }: LinkedDevicesProps) {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [code, setCode] = useState<string>();
  const [error, setError] = useState<string>();

  async function refresh() {
    try {
      setDevices(await listDevices(account.accountId, account));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load devices");
    }
  }

  useEffect(() => {
    void refresh();
    // A device linked from elsewhere has no way to notify this screen directly -
    // same eventual-consistency-via-polling approach the message pipe already uses.
    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.accountId]);

  async function handleUnlink(deviceId: string) {
    setError(undefined);
    try {
      await unlinkDevice(deviceId, account);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to unlink device");
    }
  }

  async function handleLinkInit() {
    setError(undefined);
    try {
      setCode(await linkInit(account));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to start device link");
    }
  }

  return (
    <section className="panel stack">
      <h2>Linked Devices</h2>
      <ul data-testid="device-list">
        {devices.length === 0 && <li className="list-empty">No devices yet.</li>}
        {devices.map((d) => (
          <li key={d.id} className="list-row" data-testid="device-row">
            <span className="list-row-label">
              {d.label}
              {d.id === account.deviceId && " (this device)"}
            </span>
            <button className="secondary" onClick={() => handleUnlink(d.id)}>
              Unlink
            </button>
          </li>
        ))}
      </ul>
      <button className="secondary" onClick={handleLinkInit}>
        Link a New Device
      </button>
      {code && (
        <div className="stack">
          <p className="hint">
            On the new device, choose "Link to existing account" and enter this account ID and code - expires in 5 minutes.
          </p>
          <p className="chip chip--block">{account.accountId}</p>
          <p className="chip chip--block" data-testid="link-code">
            {code}
          </p>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
