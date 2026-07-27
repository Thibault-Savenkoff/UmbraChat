import { useEffect, useState } from "react";
import { generateIdentity, computeSafetyNumber, type IdentityBundle } from "./crypto/identity";
import { loadIdentity, saveIdentity } from "./storage/keyStore";
import { registerAccount } from "./api/register";
import { CreateAccount } from "./screens/CreateAccount";
import { SafetyNumber } from "./screens/SafetyNumber";

type AccountStatus =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "ready"; identity: IdentityBundle; safetyNumber: string };

function App() {
  const [account, setAccount] = useState<AccountStatus>({ status: "loading" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    loadIdentity().then(async (existing) => {
      if (!existing) {
        setAccount({ status: "anonymous" });
        return;
      }
      const safetyNumber = await computeSafetyNumber(existing.identity_public_key);
      setAccount({ status: "ready", identity: existing, safetyNumber });
    });
  }, []);

  async function handleCreate() {
    setCreating(true);
    setError(undefined);
    try {
      const generated = await generateIdentity();
      await registerAccount(generated);
      await saveIdentity(generated);
      const safetyNumber = await computeSafetyNumber(generated.identity_public_key);
      setAccount({ status: "ready", identity: generated, safetyNumber });
    } catch (err) {
      setError(err instanceof Error ? err.message : "registration failed");
    } finally {
      setCreating(false);
    }
  }

  if (account.status === "loading") return null;

  if (account.status === "ready") {
    return <SafetyNumber safetyNumber={account.safetyNumber} />;
  }

  return <CreateAccount onCreate={handleCreate} creating={creating} error={error} />;
}

export default App;
