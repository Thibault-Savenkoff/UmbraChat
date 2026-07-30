import { useState } from "react";
import { isEncryptionEnabled, enableEncryption, disableEncryption } from "../crypto/vault";
import { exportBackup } from "../crypto/backup";

interface SettingsProps {
  onBack: () => void;
}

const MIN_PASSPHRASE_LENGTH = 8;

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Settings({ onBack }: SettingsProps) {
  const [enabled, setEnabled] = useState(isEncryptionEnabled());
  const [settingUp, setSettingUp] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  // Deliberately separate from the encryption passphrase above - a backup's
  // passphrase is never the same key (see the plan's Decisions).
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [backupWorking, setBackupWorking] = useState(false);
  const [backupError, setBackupError] = useState<string>();

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

  async function handleExportBackup() {
    setBackupWorking(true);
    setBackupError(undefined);
    try {
      const blob = await exportBackup(backupPassphrase);
      downloadBlob(blob, `umbrachat-backup-${new Date().toISOString().slice(0, 10)}.json`);
      setBackupPassphrase("");
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : "failed to export backup");
    } finally {
      setBackupWorking(false);
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

      <section className="panel stack">
        <h2>Backup</h2>
        <input
          type="password"
          placeholder="Passphrase"
          value={backupPassphrase}
          onChange={(e) => setBackupPassphrase(e.target.value)}
          disabled={backupWorking}
        />
        <button onClick={handleExportBackup} disabled={!backupPassphrase || backupWorking}>
          {backupWorking ? "Exporting..." : "Export Backup"}
        </button>
        <p className="hint">
          Saves an encrypted file you keep yourself. Forgetting this passphrase means the backup can't be restored.
        </p>
        {backupError && <p role="alert">{backupError}</p>}
      </section>
    </main>
  );
}
