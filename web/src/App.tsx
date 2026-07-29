import { useEffect, useRef, useState } from "react";
import type { SignalStore } from "wasm-crypto";
import { generateIdentity, computeSafetyNumber } from "./crypto/identity";
import { loadAccount, saveAccount, type LocalAccount } from "./storage/keyStore";
import { loadMessages, type ChatMessage } from "./storage/messageStore";
import { registerAccount } from "./api/register";
import { startConversation, sendText, sendFile, poll, getTimerSeconds, setDisappearingTimer, type FileSendStage } from "./chat/conversation";
import { startCall, acceptCall, declineCall, hangUp, handleCallSignal, subscribeToCallState, getCallState, type CallState } from "./chat/call";
import { CreateAccount } from "./screens/CreateAccount";
import { SafetyNumber } from "./screens/SafetyNumber";
import { NewConversation } from "./screens/NewConversation";
import { Conversation } from "./screens/Conversation";
import { CallScreen } from "./screens/CallScreen";

const ACTIVE_CONTACT_KEY = "umbrachat:activeContactId";
const POLL_INTERVAL_MS = 3000;
const CALL_POLL_INTERVAL_MS = 500;

function isRinging(callState: CallState): boolean {
  return callState.status === "outgoing-ringing" || callState.status === "incoming-ringing";
}

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
  const [fileStage, setFileStage] = useState<FileSendStage>();
  const [callState, setCallState] = useState<CallState>(getCallState());
  const [timerSeconds, setTimerSecondsState] = useState(0);
  const [error, setError] = useState<string>();
  const pollTimer = useRef<number>(undefined);
  const pollIntervalRef = useRef(POLL_INTERVAL_MS);

  useEffect(() => subscribeToCallState(setCallState), []);

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
    setTimerSecondsState(getTimerSeconds(contactId));
    localStorage.setItem(ACTIVE_CONTACT_KEY, contactId);

    const runPoll = async () => {
      const updated = await poll(contactId, account, store, handleCallSignal);
      setState((s) => (s.status === "conversation" ? { ...s, messages: updated } : s));
      setTimerSecondsState(getTimerSeconds(contactId));

      // Ringing needs faster signaling round trips than the normal message-poll
      // interval. This is the only place that schedules the interval (including
      // the very first time), so there's never more than one running at once.
      const desiredInterval = isRinging(getCallState()) ? CALL_POLL_INTERVAL_MS : POLL_INTERVAL_MS;
      if (desiredInterval !== pollIntervalRef.current || pollTimer.current === undefined) {
        pollIntervalRef.current = desiredInterval;
        window.clearInterval(pollTimer.current);
        pollTimer.current = window.setInterval(runPoll, desiredInterval);
      }
    };

    window.clearInterval(pollTimer.current);
    pollTimer.current = undefined;
    // setInterval only fires after a full interval elapses - poll once immediately
    // too, so messages queued while offline show up on reconnect without delay.
    await runPoll();
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

  async function handleSendFile(file: File) {
    if (state.status !== "conversation") return;
    setSending(true);
    setError(undefined);
    try {
      const messages = await sendFile(state.contactId, file, state.account, state.store, setFileStage);
      setState((s) => (s.status === "conversation" ? { ...s, messages } : s));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to send file");
    } finally {
      setSending(false);
      setFileStage(undefined);
    }
  }

  async function handleSetTimer(seconds: number) {
    if (state.status !== "conversation") return;
    setTimerSecondsState(seconds);
    await setDisappearingTimer(state.contactId, seconds, state.account, state.store);
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

  const { contactId, account, store } = state;

  return (
    <>
      {callState.status !== "idle" && (
        <CallScreen
          callState={callState}
          onAccept={() => void acceptCall(contactId, account, store)}
          onDecline={() => void declineCall(contactId, account, store)}
          onHangUp={() => void hangUp(contactId, account, store)}
        />
      )}
      <Conversation
        messages={state.messages}
        onSend={handleSend}
        onSendFile={handleSendFile}
        onStartCall={(kind) => void startCall(contactId, kind, account, store)}
        onSetTimer={handleSetTimer}
        sending={sending}
        fileStage={fileStage}
        callActive={callState.status !== "idle" && callState.status !== "ended"}
        timerSeconds={timerSeconds}
        error={error}
      />
    </>
  );
}

export default App;
