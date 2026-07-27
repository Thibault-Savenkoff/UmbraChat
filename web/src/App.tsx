import { useEffect, useRef, useState } from "react";
import type { SignalStore } from "wasm-crypto";
import { generateIdentity, computeSafetyNumber } from "./crypto/identity";
import { loadAccount, saveAccount, type LocalAccount } from "./storage/keyStore";
import { loadMessages, type ChatMessage } from "./storage/messageStore";
import { registerAccount } from "./api/register";
import { startConversation, sendText, poll } from "./chat/conversation";
import { CreateAccount } from "./screens/CreateAccount";
import { SafetyNumber } from "./screens/SafetyNumber";
import { NewConversation } from "./screens/NewConversation";
import { Conversation } from "./screens/Conversation";

const ACTIVE_CONTACT_KEY = "umbrachat:activeContactId";
const POLL_INTERVAL_MS = 3000;

type Status =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "identity-ready"; account: LocalAccount; safetyNumber: string }
  | { status: "conversation"; account: LocalAccount; contactId: string; store: SignalStore; messages: ChatMessage[] };

function App() {
  const [state, setState] = useState<Status>({ status: "loading" });
  const [creating, setCreating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const pollTimer = useRef<number>(undefined);

  useEffect(() => {
    loadAccount().then(async (existing) => {
      if (!existing) {
        setState({ status: "anonymous" });
        return;
      }
      const activeContactId = localStorage.getItem(ACTIVE_CONTACT_KEY);
      if (activeContactId) {
        await enterConversation(existing, activeContactId);
        return;
      }
      const safetyNumber = await computeSafetyNumber(existing.identity.identity_public_key);
      setState({ status: "identity-ready", account: existing, safetyNumber });
    });

    return () => window.clearInterval(pollTimer.current);
  }, []);

  async function enterConversation(account: LocalAccount, contactId: string) {
    const store = await startConversation(contactId, account);
    const messages = await loadMessages(contactId);
    setState({ status: "conversation", account, contactId, store, messages });
    localStorage.setItem(ACTIVE_CONTACT_KEY, contactId);

    const runPoll = async () => {
      const updated = await poll(contactId, account, store);
      setState((s) => (s.status === "conversation" ? { ...s, messages: updated } : s));
    };

    window.clearInterval(pollTimer.current);
    // setInterval only fires after a full interval elapses - poll once immediately
    // too, so messages queued while offline show up on reconnect without delay.
    await runPoll();
    pollTimer.current = window.setInterval(runPoll, POLL_INTERVAL_MS);
  }

  async function handleCreate() {
    setCreating(true);
    setError(undefined);
    try {
      const identity = await generateIdentity();
      const accountId = await registerAccount(identity);
      const account: LocalAccount = { accountId, identity };
      await saveAccount(account);
      const safetyNumber = await computeSafetyNumber(identity.identity_public_key);
      setState({ status: "identity-ready", account, safetyNumber });
    } catch (err) {
      setError(err instanceof Error ? err.message : "registration failed");
    } finally {
      setCreating(false);
    }
  }

  async function handleStartConversation(contactId: string) {
    if (state.status !== "identity-ready") return;
    setStarting(true);
    setError(undefined);
    try {
      await enterConversation(state.account, contactId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to start conversation");
    } finally {
      setStarting(false);
    }
  }

  async function handleSend(text: string) {
    if (state.status !== "conversation") return;
    setSending(true);
    setError(undefined);
    try {
      const messages = await sendText(state.contactId, text, state.account, state.store);
      setState((s) => (s.status === "conversation" ? { ...s, messages } : s));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to send message");
    } finally {
      setSending(false);
    }
  }

  if (state.status === "loading") return null;

  if (state.status === "anonymous") {
    return <CreateAccount onCreate={handleCreate} creating={creating} error={error} />;
  }

  if (state.status === "identity-ready") {
    return (
      <>
        <SafetyNumber accountId={state.account.accountId} safetyNumber={state.safetyNumber} />
        <NewConversation onStart={handleStartConversation} starting={starting} error={error} />
      </>
    );
  }

  return <Conversation messages={state.messages} onSend={handleSend} sending={sending} error={error} />;
}

export default App;
