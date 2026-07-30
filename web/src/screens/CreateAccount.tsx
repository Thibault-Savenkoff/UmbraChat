import { useState } from "react";

interface CreateAccountProps {
  onCreate: () => void;
  onLink: (accountId: string, code: string) => void;
  creating: boolean;
  error?: string;
}

export function CreateAccount({ onCreate, onLink, creating, error }: CreateAccountProps) {
  const [linkAccountId, setLinkAccountId] = useState("");
  const [linkCode, setLinkCode] = useState("");

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

      {error && <p role="alert">{error}</p>}
    </main>
  );
}
