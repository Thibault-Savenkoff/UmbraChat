import { useState } from "react";

interface CreateAccountProps {
  onCreate: () => void;
  onLink: (accountId: string, code: string) => void;
  onRestore: (file: File, passphrase: string) => void;
  creating: boolean;
  error?: string;
}

export function CreateAccount({ onCreate, onLink, onRestore, creating, error }: CreateAccountProps) {
  const [linkAccountId, setLinkAccountId] = useState("");
  const [linkCode, setLinkCode] = useState("");
  const [backupFile, setBackupFile] = useState<File>();
  const [backupPassphrase, setBackupPassphrase] = useState("");

  return (
    <main className="screen">
      <div className="stack" style={{ textAlign: "center" }}>
        <h1>UmbraChat</h1>
        <p>No password. Your keys never leave this device.</p>
      </div>

      <div className="panel stack">
        <button onClick={onCreate} disabled={creating}>
          {creating ? "Creating..." : "Create Account"}
        </button>
      </div>

      <div className="panel stack">
        <h2>Already have an account?</h2>
        <p className="hint">Enter its account ID and pairing code below.</p>
        <input placeholder="Account ID" value={linkAccountId} onChange={(e) => setLinkAccountId(e.target.value)} disabled={creating} />
        <input placeholder="Pairing code" value={linkCode} onChange={(e) => setLinkCode(e.target.value)} disabled={creating} />
        <button className="secondary" onClick={() => onLink(linkAccountId, linkCode)} disabled={creating || !linkAccountId.trim() || !linkCode.trim()}>
          Link This Device
        </button>
      </div>

      <div className="panel stack">
        <h2>Lost your device?</h2>
        <input
          type="file"
          accept=".json"
          aria-label="Backup file"
          onChange={(e) => setBackupFile(e.target.files?.[0])}
          disabled={creating}
        />
        <input
          type="password"
          placeholder="Backup passphrase"
          value={backupPassphrase}
          onChange={(e) => setBackupPassphrase(e.target.value)}
          disabled={creating}
        />
        <button
          className="secondary"
          onClick={() => backupFile && onRestore(backupFile, backupPassphrase)}
          disabled={creating || !backupFile || !backupPassphrase}
        >
          {creating ? "Restoring..." : "Restore from Backup"}
        </button>
      </div>

      {error && <p role="alert">{error}</p>}
    </main>
  );
}
