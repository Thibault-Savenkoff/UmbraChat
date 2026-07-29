import { useEffect, useRef, useState } from "react";
import type { CallEndReason, CallState } from "../chat/call";

interface CallScreenProps {
  callState: Exclude<CallState, { status: "idle" }>;
  onAccept: () => void;
  onDecline: () => void;
  onHangUp: () => void;
}

const END_REASON_LABEL: Record<CallEndReason, string> = {
  hangup: "Call ended",
  declined: "Declined",
  cancelled: "Call cancelled",
  timeout: "Unreachable",
  failed: "Call failed",
};

function VideoPane({ stream, muted, testId }: { stream: MediaStream | null; muted: boolean; testId: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} data-testid={testId} />;
}

function AudioPane({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay data-testid="remote-audio" />;
}

export function CallScreen({ callState, onAccept, onDecline, onHangUp }: CallScreenProps) {
  const [muted, setMuted] = useState(false);

  function toggleMute() {
    if (!("localStream" in callState)) return;
    const next = !muted;
    for (const track of callState.localStream.getAudioTracks()) track.enabled = !next;
    setMuted(next);
  }

  if (callState.status === "incoming-ringing") {
    return (
      <div data-testid="incoming-call-banner">
        <p>Incoming {callState.kind} call</p>
        <button onClick={onAccept}>Accept</button>
        <button onClick={onDecline}>Decline</button>
      </div>
    );
  }

  if (callState.status === "ended") {
    return (
      <div data-testid="call-ended">
        <p data-testid="call-end-reason">{END_REASON_LABEL[callState.reason]}</p>
      </div>
    );
  }

  // outgoing-ringing, connecting, or connected
  const isVideo = callState.kind === "video";
  const remoteStream = "remoteStream" in callState ? callState.remoteStream : null;

  return (
    <div data-testid="active-call-screen">
      <p data-testid="call-status-label">{callState.status === "outgoing-ringing" ? "Calling..." : callState.status === "connecting" ? "Connecting..." : "Connected"}</p>
      {isVideo ? <VideoPane stream={remoteStream} muted={false} testId="remote-video" /> : <AudioPane stream={remoteStream} />}
      {isVideo && <VideoPane stream={callState.localStream} muted testId="local-video" />}
      <button onClick={toggleMute}>{muted ? "Unmute" : "Mute"}</button>
      <button onClick={onHangUp}>Hang Up</button>
    </div>
  );
}
