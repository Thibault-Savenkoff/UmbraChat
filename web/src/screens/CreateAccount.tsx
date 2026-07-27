interface CreateAccountProps {
  onCreate: () => void;
  creating: boolean;
  error?: string;
}

export function CreateAccount({ onCreate, creating, error }: CreateAccountProps) {
  return (
    <main>
      <h1>UmbraChat</h1>
      <button onClick={onCreate} disabled={creating}>
        {creating ? "Creating..." : "Create Account"}
      </button>
      <p>No password. Your keys never leave this device.</p>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
