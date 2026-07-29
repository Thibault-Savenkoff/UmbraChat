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
    <main>
      <h1>UmbraChat</h1>
      <button onClick={onCreate} disabled={creating}>
        {creating ? "Creating..." : "Create Account"}
      </button>
      <p>No password. Your keys never leave this device.</p>

      <p>Already have an account on another device?</p>
      <input placeholder="Account ID" value={linkAccountId} onChange={(e) => setLinkAccountId(e.target.value)} disabled={creating} />
      <input placeholder="Pairing code" value={linkCode} onChange={(e) => setLinkCode(e.target.value)} disabled={creating} />
      <button onClick={() => onLink(linkAccountId, linkCode)} disabled={creating || !linkAccountId.trim() || !linkCode.trim()}>
        Link This Device
      </button>

      {error && <p role="alert">{error}</p>}
    </main>
  );
}
