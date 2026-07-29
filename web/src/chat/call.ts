import type { SignalStore } from "wasm-crypto";
import type { LocalAccount } from "../storage/keyStore";
import { sendCallSignal, type CallEnvelope, type CallEndEnvelope } from "./conversation";

export type CallKind = "voice" | "video";
export type CallEndReason = CallEndEnvelope["reason"];

export type CallState =
  | { status: "idle" }
  | { status: "outgoing-ringing"; callId: string; kind: CallKind; localStream: MediaStream }
  | { status: "incoming-ringing"; callId: string; kind: CallKind }
  | { status: "connecting"; callId: string; kind: CallKind; localStream: MediaStream; remoteStream: MediaStream | null }
  | { status: "connected"; callId: string; kind: CallKind; localStream: MediaStream; remoteStream: MediaStream | null }
  | { status: "ended"; reason: CallEndReason };

// ponytail: a single well-known public STUN server as the default, configurable
// via VITE_STUN_URL for the self-hosted one architecture.md calls for in
// production. No TURN entry anywhere - direct P2P only, per that same decision.
const ICE_SERVERS: RTCIceServer[] = [{ urls: import.meta.env.VITE_STUN_URL ?? "stun:stun.l.google.com:19302" }];
const ANSWER_TIMEOUT_MS = 30000;
const IDLE_RESET_MS = 3000;

let state: CallState = { status: "idle" };
let pc: RTCPeerConnection | null = null;
let pendingOffer: { callId: string; kind: CallKind; sdp: string } | null = null;
let pendingIceCandidates: RTCIceCandidateInit[] = [];
// ontrack can fire before the "connecting" state exists yet (its timing relative
// to setRemoteDescription's own completion isn't guaranteed) - buffered here,
// independent of CallState, so an early track is never silently dropped.
let remoteStreamBuffer: MediaStream | null = null;
let answerTimer: number | undefined;
let idleResetTimer: number | undefined;
const listeners = new Set<(s: CallState) => void>();

function setState(next: CallState): void {
  state = next;
  for (const listener of listeners) listener(state);
}

export function getCallState(): CallState {
  return state;
}

export function subscribeToCallState(listener: (s: CallState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function cleanup(): void {
  window.clearTimeout(answerTimer);
  answerTimer = undefined;
  pc?.close();
  pc = null;
  pendingOffer = null;
  pendingIceCandidates = [];
  remoteStreamBuffer = null;
  // Releasing the camera/mic is not optional - leaving it on after a call ends
  // is a real privacy bug in an app built specifically to resist surveillance.
  if ("localStream" in state) for (const track of state.localStream.getTracks()) track.stop();
}

function scheduleIdleReset(): void {
  window.clearTimeout(idleResetTimer);
  idleResetTimer = window.setTimeout(() => setState({ status: "idle" }), IDLE_RESET_MS);
}

async function endCall(contactId: string, reason: CallEndReason, callId: string, account: LocalAccount, store: SignalStore): Promise<void> {
  cleanup();
  setState({ status: "ended", reason });
  scheduleIdleReset();
  await sendCallSignal(contactId, { type: "call-end", callId, reason }, account, store);
}

function newPeerConnection(contactId: string, callId: string, kind: CallKind, account: LocalAccount, store: SignalStore): RTCPeerConnection {
  const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  conn.onicecandidate = (e) => {
    if (pc !== conn) return; // stale connection, already replaced/closed
    if (e.candidate) void sendCallSignal(contactId, { type: "call-ice", callId, candidate: e.candidate.toJSON() }, account, store);
  };

  conn.ontrack = (e) => {
    if (pc !== conn) return;
    remoteStreamBuffer = e.streams[0] ?? null;
    if (state.status === "connecting" || state.status === "connected") {
      setState({ ...state, remoteStream: remoteStreamBuffer });
    }
  };

  conn.onconnectionstatechange = () => {
    if (pc !== conn) return;
    if (conn.connectionState === "connected" && state.status === "connecting") {
      window.clearTimeout(answerTimer);
      setState({ status: "connected", callId, kind, localStream: state.localStream, remoteStream: state.remoteStream });
    } else if (conn.connectionState === "failed") {
      void endCall(contactId, "failed", callId, account, store);
    }
  };

  return conn;
}

export async function startCall(contactId: string, kind: CallKind, account: LocalAccount, store: SignalStore): Promise<void> {
  cleanup();
  const callId = crypto.randomUUID();
  const localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: kind === "video" });
  pc = newPeerConnection(contactId, callId, kind, account, store);
  for (const track of localStream.getTracks()) pc.addTrack(track, localStream);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await sendCallSignal(contactId, { type: "call-offer", callId, kind, sdp: offer.sdp ?? "" }, account, store);

  setState({ status: "outgoing-ringing", callId, kind, localStream });
  answerTimer = window.setTimeout(() => void endCall(contactId, "timeout", callId, account, store), ANSWER_TIMEOUT_MS);
}

export async function acceptCall(contactId: string, account: LocalAccount, store: SignalStore): Promise<void> {
  if (state.status !== "incoming-ringing" || !pendingOffer) return;
  const { callId, kind, sdp } = pendingOffer;

  const localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: kind === "video" });
  pc = newPeerConnection(contactId, callId, kind, account, store);
  for (const track of localStream.getTracks()) pc.addTrack(track, localStream);

  await pc.setRemoteDescription({ type: "offer", sdp });
  for (const candidate of pendingIceCandidates) await pc.addIceCandidate(candidate);
  pendingIceCandidates = [];

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await sendCallSignal(contactId, { type: "call-answer", callId, sdp: answer.sdp ?? "" }, account, store);

  pendingOffer = null;
  setState({ status: "connecting", callId, kind, localStream, remoteStream: remoteStreamBuffer });
}

export async function declineCall(contactId: string, account: LocalAccount, store: SignalStore): Promise<void> {
  if (state.status !== "incoming-ringing" || !pendingOffer) return;
  await endCall(contactId, "declined", pendingOffer.callId, account, store);
}

export async function hangUp(contactId: string, account: LocalAccount, store: SignalStore): Promise<void> {
  if (state.status !== "outgoing-ringing" && state.status !== "connecting" && state.status !== "connected") return;
  const reason: CallEndReason = state.status === "outgoing-ringing" ? "cancelled" : "hangup";
  await endCall(contactId, reason, state.callId, account, store);
}

/**
 * Reacts to an incoming call-* envelope, already routed here by conversation.ts's
 * poll(). Purely reactive - every reply this state machine ever sends (answer,
 * ICE candidates, call-end) is triggered by a user action (startCall/acceptCall/
 * declineCall/hangUp) or a connection-state callback, never by receiving a signal,
 * so this never needs the contact/account/store to send anything itself.
 */
export async function handleCallSignal(envelope: CallEnvelope): Promise<void> {
  if (envelope.type === "call-offer") {
    // ponytail: only one call at a time, matching the app's single-active-contact
    // model - an offer that arrives while already in a call is dropped rather than
    // building a busy-signal reply. Add one if a real multi-call scenario shows up.
    if (state.status !== "idle" && state.status !== "ended") return;
    pendingOffer = { callId: envelope.callId, kind: envelope.kind, sdp: envelope.sdp };
    pendingIceCandidates = [];
    setState({ status: "incoming-ringing", callId: envelope.callId, kind: envelope.kind });
    return;
  }

  if (envelope.type === "call-answer") {
    if (state.status !== "outgoing-ringing" || state.callId !== envelope.callId || !pc) return;
    window.clearTimeout(answerTimer);
    const { callId, kind, localStream } = state;
    await pc.setRemoteDescription({ type: "answer", sdp: envelope.sdp });
    for (const candidate of pendingIceCandidates) await pc.addIceCandidate(candidate);
    pendingIceCandidates = [];
    setState({ status: "connecting", callId, kind, localStream, remoteStream: remoteStreamBuffer });
    return;
  }

  if (envelope.type === "call-ice") {
    const activeCallId = pendingOffer?.callId ?? (state.status !== "idle" && state.status !== "ended" ? state.callId : undefined);
    if (activeCallId !== envelope.callId) return;
    // remoteDescription isn't set yet on the callee's side until acceptCall runs -
    // addIceCandidate throws if called first, so queue until then.
    if (pc?.remoteDescription) await pc.addIceCandidate(envelope.candidate);
    else pendingIceCandidates.push(envelope.candidate);
    return;
  }

  // call-end
  const activeCallId = pendingOffer?.callId ?? (state.status !== "idle" && state.status !== "ended" ? state.callId : undefined);
  if (activeCallId !== envelope.callId) return;
  cleanup();
  setState({ status: "ended", reason: envelope.reason });
  scheduleIdleReset();
}
