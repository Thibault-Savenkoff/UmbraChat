import { useState } from "react";
import { isEncryptionEnabled, enableEncryption, disableEncryption } from "../crypto/vault";

interface SettingsProps {
  onBack: () => void;
}

const MIN_PASSPHRASE_LENGTH = 8;

export function Settings({ onBack }: SettingsProps) {
  const [enabled, setEnabled] = useState(isEncryptionEnabled());
  const [settingUp, setSettingUp] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  const canSubmit = passphrase.length >= MIN_PASSPHRASE_LENGTH && passphrase === confirm;

  async function handleEnable() {
    setWorking(true);
    setError(undefined);
    try {
      await enableEncryption(passphrase);
      setEnabled(true);
      setSettingUp(false);
      setPassphrase("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to enable encryption");
    } finally {
      setWorking(false);
    }
  }

  async function handleDisable() {
    setWorking(true);
    setError(undefined);
    try {
      await disableEncryption();
      setEnabled(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to disable encryption");
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="screen">
      <div className="convo-toolbar">
        <button className="secondary" onClick={onBack} aria-label="Back to menu">
          ← Menu
        </button>
        <h1>Settings</h1>
      </div>

      <section className="panel stack">
        <h2>Local Encryption</h2>
        {!settingUp ? (
          <>
            <div className="row">
              <span data-testid="encryption-status">{enabled ? "On" : "Off"}</span>
              {enabled ? (
                <button className="danger" onClick={handleDisable} disabled={working}>
                  {working ? "Disabling..." : "Disable"}
                </button>
              ) : (
                <button onClick={() => setSettingUp(true)} disabled={working}>
                  Enable
                </button>
              )}
            </div>
            <p className="hint">Protects your messages and keys if this device is lost or seized.</p>
          </>
        ) : (
          <div className="stack">
            <input
              type="password"
              placeholder="Passphrase"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              disabled={working}
            />
            <input
              type="password"
              placeholder="Confirm passphrase"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={working}
            />
            <button onClick={handleEnable} disabled={!canSubmit || working}>
              {working ? "Enabling..." : "Enable Encryption"}
            </button>
            <p className="hint">⚠ If you forget this, your messages can't be recovered.</p>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
    </main>
  );
}
