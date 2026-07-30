import { useState } from "react";

interface UnlockProps {
  onUnlock: (passphrase: string) => Promise<boolean>;
}

export function Unlock({ onUnlock }: UnlockProps) {
  const [passphrase, setPassphrase] = useState("");
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleSubmit() {
    setWorking(true);
    setFailed(false);
    try {
      const ok = await onUnlock(passphrase);
      if (!ok) {
        setFailed(true);
        setPassphrase("");
      }
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="screen">
      <h1>UmbraChat — Locked</h1>
      <section className="panel stack">
        <input
          type="password"
          placeholder="Passphrase"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          disabled={working}
          autoFocus
        />
        <button onClick={handleSubmit} disabled={working || !passphrase}>
          {working ? "Unlocking..." : "Unlock"}
        </button>
        {failed && <p role="alert">Wrong passphrase. Try again.</p>}
      </section>
    </main>
  );
}
