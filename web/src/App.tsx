import { useEffect, useRef, useState } from "react";
import type { SignalStore } from "wasm-crypto";
import { generateIdentity, computeSafetyNumber } from "./crypto/identity";
import { loadAccount, saveAccount, type LocalAccount } from "./storage/keyStore";
import { importBackup } from "./crypto/backup";
import { isEncryptionEnabled, isVaultActive, unlock } from "./crypto/vault";
import { loadMessages, type ChatMessage } from "./storage/messageStore";
import { registerAccount } from "./api/register";
import { completeLink } from "./api/devices";
import { startConversation, sendText, sendFile, markFileOpened, markConversationRead, poll, getTimerSeconds, setDisappearingTimer, type FileSendStage, type FileDestruct } from "./chat/conversation";
import { startCall, acceptCall, declineCall, hangUp, handleCallSignal, subscribeToCallState, getCallState, type CallState } from "./chat/call";
import { createGroup, sendGroupText, removeMember, handleGroupSignal, loadAllGroups, type Group } from "./chat/group";
import { openStore } from "./crypto/session";
import { loadGroup } from "./storage/groupStore";
import { CreateAccount } from "./screens/CreateAccount";
import { SafetyNumber } from "./screens/SafetyNumber";
import { LinkedDevices } from "./screens/LinkedDevices";
import { NewConversation } from "./screens/NewConversation";
import { Conversation } from "./screens/Conversation";
import { CallScreen } from "./screens/CallScreen";
import { Groups } from "./screens/Groups";
import { GroupConversation } from "./screens/GroupConversation";
import { IncomingChats } from "./screens/IncomingChats";
import { Settings } from "./screens/Settings";
import { Unlock } from "./screens/Unlock";

const ACTIVE_CONTACT_KEY = "umbrachat:activeContactId";
const POLL_INTERVAL_MS = 3000;
const CALL_POLL_INTERVAL_MS = 500;

function isRinging(callState: CallState): boolean {
  return callState.status === "outgoing-ringing" || callState.status === "incoming-ringing";
}

type Status =
  | { status: "loading" }
  | { status: "locked" }
  | { status: "anonymous" }
  | { status: "identity-ready"; account: LocalAccount; safetyNumber: string; groups: Group[] }
  | { status: "conversation"; account: LocalAccount; contactId: string; store: SignalStore; messages: ChatMessage[] }
  | { status: "group"; account: LocalAccount; group: Group; store: SignalStore; messages: ChatMessage[] }
  | { status: "settings"; account: LocalAccount };

function App() {
  const [state, setState] = useState<Status>({ status: "loading" });
  const [creating, setCreating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [fileStage, setFileStage] = useState<FileSendStage>();
  const [callState, setCallState] = useState<CallState>(getCallState());
  const [timerSeconds, setTimerSecondsState] = useState(0);
  const [error, setError] = useState<string>();
  // Senders who've messaged while idle on the identity-ready screen, that
  // haven't been opened yet - lets the recipient side of a new conversation
  // find out without already knowing to type the sender's account id first.
  const [pendingChats, setPendingChats] = useState<string[]>([]);
  const pollTimer = useRef<number>(undefined);
  const pollIntervalRef = useRef(POLL_INTERVAL_MS);
  // Whichever screen's runPoll is currently active - iOS Safari (and other
  // mobile browsers) suspend setInterval almost entirely in a backgrounded
  // tab, so a message sent while the tab was in the background can sit
  // un-polled long after it arrives server-side. Firing one poll the moment
  // the tab becomes visible again catches up immediately instead of waiting
  // for the next interval tick, which may not come for a while.
  const activePollRef = useRef<() => Promise<void>>(undefined);

  useEffect(() => subscribeToCallState(setCallState), []);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") void activePollRef.current?.();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // The real boot logic - reused both when encryption is off (runs directly)
  // and after a successful unlock (runs once the vault key is active).
  async function bootIntoAccount() {
    const existing = await loadAccount();
    if (!existing) {
      setState({ status: "anonymous" });
      return;
    }
    const activeContactId = localStorage.getItem(ACTIVE_CONTACT_KEY);
    if (activeContactId) {
      await enterConversation(existing, activeContactId);
      return;
    }
    await enterIdentityReady(existing);
  }

  useEffect(() => {
    // Checked before calling loadAccount() at all - loadAccount() decrypts
    // through the vault, which throws if encryption is on but nothing has
    // unlocked it yet (isVaultActive() is false right after a fresh page
    // load, always - the key only ever lives in memory, never localStorage).
    if (isEncryptionEnabled() && !isVaultActive()) {
      setState({ status: "locked" });
    } else {
      void bootIntoAccount();
    }

    return () => window.clearInterval(pollTimer.current);
  }, []);

  async function handleUnlock(passphrase: string): Promise<boolean> {
    const ok = await unlock(passphrase, loadAccount);
    if (ok) await bootIntoAccount();
    return ok;
  }

  // Shares the same pollTimer as enterConversation/enterGroup - a group invite
  // has to be discoverable from here too (there's otherwise no way to learn
  // about one without already knowing its groupId, or happening to have some
  // unrelated 1:1 conversation open). Screens are mutually exclusive in this
  // app, so there's no concurrent-poller risk in giving this one its own turn.
  // Fires from any screen's poll, not just the identity-ready one - most real
  // sessions resume straight into a cached conversation (see ACTIVE_CONTACT_KEY
  // below) and never touch identity-ready at all, so a notice that only fired
  // from there would almost never actually surface. pendingChats itself is
  // only ever rendered on the identity-ready screen, so an entry captured
  // elsewhere just waits quietly until the user navigates back to it.
  function addPendingChat(senderId: string) {
    setPendingChats((prev) => (prev.includes(senderId) ? prev : [...prev, senderId]));
  }

  async function enterIdentityReady(account: LocalAccount) {
    const safetyNumber = await computeSafetyNumber(account.identity.identity_public_key);
    const groups = await loadAllGroups();
    setState({ status: "identity-ready", account, safetyNumber, groups });

    const store = await openStore(account.identity);
    const runPoll = async () => {
      await poll(undefined, account, store, undefined, handleGroupSignal, addPendingChat);
      const updatedGroups = await loadAllGroups();
      setState((s) => (s.status === "identity-ready" ? { ...s, groups: updatedGroups } : s));
    };
    activePollRef.current = runPoll;

    window.clearInterval(pollTimer.current);
    pollTimer.current = undefined;
    pollIntervalRef.current = POLL_INTERVAL_MS;
    await runPoll();
    pollTimer.current = window.setInterval(runPoll, POLL_INTERVAL_MS);
  }

  async function enterConversation(account: LocalAccount, contactId: string) {
    const store = await startConversation(contactId, account);
    const messages = await loadMessages(contactId);
    setState({ status: "conversation", account, contactId, store, messages });
    setTimerSecondsState(getTimerSeconds(contactId));
    localStorage.setItem(ACTIVE_CONTACT_KEY, contactId);

    // The user is actually looking at this conversation now - this is the
    // real "read" moment, not whenever a background poll happened to
    // decrypt a message from a sender nobody had opened yet (see
    // markConversationRead's doc comment for the presence-oracle it fixes).
    const readMessages = await markConversationRead(contactId, account, store);
    setState((s) => (s.status === "conversation" && s.contactId === contactId ? { ...s, messages: readMessages } : s));

    const runPoll = async () => {
      const updated = await poll(contactId, account, store, handleCallSignal, handleGroupSignal, addPendingChat);
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
    activePollRef.current = runPoll;

    window.clearInterval(pollTimer.current);
    pollTimer.current = undefined;
    // setInterval only fires after a full interval elapses - poll once immediately
    // too, so messages queued while offline show up on reconnect without delay.
    await runPoll();
  }

  // Shares the exact same pollTimer/pollIntervalRef as enterConversation -
  // GET /v1/messages is fetch-and-delete, so two independent poll loops would
  // race to consume the same queued messages. Only one is ever active.
  async function enterGroup(account: LocalAccount, groupId: string) {
    const group = await loadGroup(groupId);
    if (!group) return;
    const store = await openStore(account.identity);
    const messages = await loadMessages(groupId);
    setState({ status: "group", account, group, store, messages });

    const runPoll = async () => {
      // poll()'s own return value is always [] with no contactId - a group's
      // messages are written straight to storage by handleGroupSignal instead,
      // so they're reloaded from there, not taken from poll()'s result.
      await poll(undefined, account, store, undefined, handleGroupSignal, addPendingChat);
      const [refreshedGroup, updatedMessages] = await Promise.all([loadGroup(groupId), loadMessages(groupId)]);
      setState((s) => (s.status === "group" && refreshedGroup ? { ...s, group: refreshedGroup, messages: updatedMessages } : s));
    };
    activePollRef.current = runPoll;

    window.clearInterval(pollTimer.current);
    pollTimer.current = undefined;
    pollIntervalRef.current = POLL_INTERVAL_MS;
    await runPoll();
    pollTimer.current = window.setInterval(runPoll, POLL_INTERVAL_MS);
  }

  async function handleCreate() {
    setCreating(true);
    setError(undefined);
    try {
      const identity = await generateIdentity();
      const { accountId, deviceId } = await registerAccount(identity);
      const account: LocalAccount = { accountId, deviceId, identity };
      await saveAccount(account);
      await enterIdentityReady(account);
    } catch (err) {
      setError(err instanceof Error ? err.message : "registration failed");
    } finally {
      setCreating(false);
    }
  }

  async function handleLinkDevice(accountId: string, code: string) {
    setCreating(true);
    setError(undefined);
    try {
      const identity = await generateIdentity();
      const deviceId = await completeLink(accountId, code, "Linked Device", identity);
      const account: LocalAccount = { accountId, deviceId, identity };
      await saveAccount(account);
      await enterIdentityReady(account);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to link device");
    } finally {
      setCreating(false);
    }
  }

  async function handleRestore(file: File, passphrase: string) {
    setCreating(true);
    setError(undefined);
    try {
      const account = await importBackup(file, passphrase);
      await enterIdentityReady(account);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to restore backup");
    } finally {
      setCreating(false);
    }
  }

  async function handleStartConversation(contactId: string) {
    if (state.status !== "identity-ready") return;
    if (contactId === state.account.accountId) {
      setError("that's your own account id - enter a contact's id instead");
      return;
    }
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

  async function handleSendFile(file: File, destruct?: FileDestruct) {
    if (state.status !== "conversation") return;
    setSending(true);
    setError(undefined);
    try {
      const messages = await sendFile(state.contactId, file, state.account, state.store, setFileStage, destruct);
      setState((s) => (s.status === "conversation" ? { ...s, messages } : s));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to send file");
    } finally {
      setSending(false);
      setFileStage(undefined);
    }
  }

  async function handleOpenFile(messageId: string) {
    if (state.status !== "conversation") return;
    const messages = await markFileOpened(state.contactId, messageId, state.account, state.store);
    setState((s) => (s.status === "conversation" ? { ...s, messages } : s));
  }

  async function handleSetTimer(seconds: number) {
    if (state.status !== "conversation") return;
    setTimerSecondsState(seconds);
    await setDisappearingTimer(state.contactId, seconds, state.account, state.store);
  }

  async function handleCreateGroup(name: string, memberAccountIds: string[]) {
    if (state.status !== "identity-ready") return;
    setCreating(true);
    setError(undefined);
    try {
      const store = await openStore(state.account.identity);
      await createGroup(name, memberAccountIds, state.account, store);
      const groups = await loadAllGroups();
      setState((s) => (s.status === "identity-ready" ? { ...s, groups } : s));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to create group");
    } finally {
      setCreating(false);
    }
  }

  async function handleOpenGroup(groupId: string) {
    if (state.status !== "identity-ready") return;
    await enterGroup(state.account, groupId);
  }

  async function handleSendGroupText(text: string) {
    if (state.status !== "group") return;
    setSending(true);
    setError(undefined);
    try {
      const messages = await sendGroupText(state.group.id, text, state.account, state.store);
      setState((s) => (s.status === "group" ? { ...s, messages } : s));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to send group message");
    } finally {
      setSending(false);
    }
  }

  async function handleOpenPendingChat(contactId: string) {
    if (state.status !== "identity-ready") return;
    setPendingChats((prev) => prev.filter((id) => id !== contactId));
    await enterConversation(state.account, contactId);
  }

  async function handleBackToMenu() {
    if (state.status !== "conversation" && state.status !== "group" && state.status !== "settings") return;
    localStorage.removeItem(ACTIVE_CONTACT_KEY);
    await enterIdentityReady(state.account);
  }

  function handleOpenSettings() {
    if (state.status !== "identity-ready") return;
    setState({ status: "settings", account: state.account });
  }

  async function handleRemoveMember(memberAccountId: string) {
    if (state.status !== "group") return;
    setError(undefined);
    try {
      const group = await removeMember(state.group.id, memberAccountId, state.account, state.store);
      setState((s) => (s.status === "group" ? { ...s, group } : s));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to remove member");
    }
  }

  if (state.status === "loading") return null;

  if (state.status === "locked") {
    return (
      <div className="app-shell">
        <Unlock onUnlock={handleUnlock} />
      </div>
    );
  }

  if (state.status === "anonymous") {
    return (
      <div className="app-shell">
        <CreateAccount onCreate={handleCreate} onLink={handleLinkDevice} onRestore={handleRestore} creating={creating} error={error} />
      </div>
    );
  }

  if (state.status === "identity-ready") {
    return (
      <div className="app-shell">
        <div className="screen">
          <h1>UmbraChat</h1>
          <IncomingChats pendingChats={pendingChats} onOpen={handleOpenPendingChat} />
          <SafetyNumber accountId={state.account.accountId} safetyNumber={state.safetyNumber} />
          <LinkedDevices account={state.account} />
          <Groups groups={state.groups} ownAccountId={state.account.accountId} onCreateGroup={handleCreateGroup} onOpenGroup={handleOpenGroup} creating={creating} error={error} />
          <NewConversation onStart={handleStartConversation} starting={starting} error={error} />
          <button className="secondary" onClick={handleOpenSettings}>
            Settings
          </button>
        </div>
      </div>
    );
  }

  if (state.status === "settings") {
    return (
      <div className="app-shell">
        <Settings onBack={handleBackToMenu} />
      </div>
    );
  }

  if (state.status === "group") {
    return (
      <div className="app-shell">
        <GroupConversation
          group={state.group}
          account={state.account}
          messages={state.messages}
          onSend={handleSendGroupText}
          onRemoveMember={handleRemoveMember}
          onBack={handleBackToMenu}
          sending={sending}
          error={error}
        />
      </div>
    );
  }

  const { contactId, account, store } = state;

  return (
    <div className="app-shell">
      {callState.status !== "idle" && (
        <CallScreen
          callState={callState}
          onAccept={() => acceptCall(contactId, account, store).catch((err) => console.error("acceptCall failed:", err))}
          onDecline={() => declineCall(contactId, account, store).catch((err) => console.error("declineCall failed:", err))}
          onHangUp={() => hangUp(contactId, account, store).catch((err) => console.error("hangUp failed:", err))}
        />
      )}
      <Conversation
        messages={state.messages}
        onSend={handleSend}
        onSendFile={handleSendFile}
        onOpenFile={handleOpenFile}
        onStartCall={(kind) => startCall(contactId, kind, account, store).catch((err) => console.error("startCall failed:", err))}
        onSetTimer={handleSetTimer}
        onBack={handleBackToMenu}
        sending={sending}
        fileStage={fileStage}
        callActive={callState.status !== "idle" && callState.status !== "ended"}
        timerSeconds={timerSeconds}
        error={error}
      />
    </div>
  );
}

export default App;
