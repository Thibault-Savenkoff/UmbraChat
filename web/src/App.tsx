import { useEffect, useState } from "react";
import { generateIdentity, computeSafetyNumber, type IdentityBundle } from "./crypto/identity";
import { loadIdentity, saveIdentity } from "./storage/keyStore";
import { registerAccount } from "./api/register";
import { CreateAccount } from "./screens/CreateAccount";
import { SafetyNumber } from "./screens/SafetyNumber";

function App() {
  const [identity, setIdentity] = useState<IdentityBundle | null | undefined>(undefined);
  const [safetyNumber, setSafetyNumber] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    loadIdentity().then((existing) => setIdentity(existing ?? null));
  }, []);

  useEffect(() => {
    if (identity) computeSafetyNumber(identity.identity_public_key).then(setSafetyNumber);
  }, [identity]);

  async function handleCreate() {
    setCreating(true);
    setError(undefined);
    try {
      const generated = await generateIdentity();
      await registerAccount(generated);
      await saveIdentity(generated);
      setIdentity(generated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "registration failed");
    } finally {
      setCreating(false);
    }
  }

  if (identity === undefined) return null;

  if (identity && safetyNumber) {
    return <SafetyNumber safetyNumber={safetyNumber} />;
  }

  return <CreateAccount onCreate={handleCreate} creating={creating} error={error} />;
}

export default App;
