import { useMemo, useState } from "react";
import type { ChatMessage } from "../storage/messageStore";
import { isFileTooLarge, type FileSendStage } from "../chat/conversation";

interface ConversationProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onSendFile: (file: File) => void;
  onStartCall: (kind: "voice" | "video") => void;
  onSetTimer: (seconds: number) => void;
  sending: boolean;
  fileStage?: FileSendStage;
  callActive: boolean;
  timerSeconds: number;
  error?: string;
}

const TIMER_OPTIONS: [number, string][] = [
  [0, "Off"],
  [30, "30s"],
  [5 * 60, "5m"],
  [60 * 60, "1h"],
  [24 * 60 * 60, "1d"],
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function FileMessage({ message }: { message: ChatMessage }) {
  const file = message.file!;
  // Keyed on message.id, not file.bytes: messages reload fresh from storage on
  // every poll, so the Uint8Array reference changes even when the content
  // hasn't - id is the stable identity.
  //
  // ponytail: deliberately never revoked. React StrictMode's dev-mode double
  // effect invocation (mount -> cleanup -> mount) would revoke this on the
  // first render without useMemo re-running to replace it, permanently
  // breaking the download - a revoke-on-cleanup + useMemo combination isn't
  // StrictMode-safe. The URL's lifetime is already bounded to the page
  // session (freed on reload/close); fine at this scale.
  const url = useMemo(() => URL.createObjectURL(new Blob([Uint8Array.from(file.bytes)], { type: file.mimeType })), [message.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span data-testid="file-message">
      📎 {file.filename} ({formatSize(file.size)})
      {message.direction === "sent" ? (
        <span data-testid="message-status"> ({message.status})</span>
      ) : (
        <a href={url} download={file.filename} data-testid="file-download">
          Download
        </a>
      )}
    </span>
  );
}

export function Conversation({
  messages,
  onSend,
  onSendFile,
  onStartCall,
  onSetTimer,
  sending,
  fileStage,
  callActive,
  timerSeconds,
  error,
}: ConversationProps) {
  const [text, setText] = useState("");
  const [fileError, setFileError] = useState<string>();

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (!file) return;
    setFileError(undefined);
    if (isFileTooLarge(file)) {
      setFileError(`${file.name} is too large (max 8MB)`);
      return;
    }
    onSendFile(file);
  }

  return (
    <main>
      <h1>Conversation</h1>
      <p role="note" data-testid="screenshot-disclosure">
        ⚠ Screenshots can't be detected on web - assume anything shown here can be captured.
      </p>
      <button onClick={() => onStartCall("voice")} disabled={callActive} aria-label="Voice call">
        📞
      </button>
      <button onClick={() => onStartCall("video")} disabled={callActive} aria-label="Video call">
        🎥
      </button>
      <label>
        ⏱
        <select
          data-testid="timer-picker"
          aria-label="Disappearing message timer"
          value={timerSeconds}
          onChange={(e) => onSetTimer(Number(e.target.value))}
          disabled={sending}
        >
          {TIMER_OPTIONS.map(([seconds, label]) => (
            <option key={seconds} value={seconds}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <ul data-testid="message-list">
        {messages.map((m) => (
          <li key={m.id} data-testid={`message-${m.direction}`}>
            {m.file ? <FileMessage message={m} /> : <span>{m.text}</span>}
            {!m.file && (m.timerSeconds || m.expiresAt) && <span data-testid="disappearing-marker"> ⏱</span>}
            {m.direction === "sent" && !m.file && <span data-testid="message-status"> ({m.status})</span>}
          </li>
        ))}
      </ul>
      <input
        type="text"
        placeholder="Type a message..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSend()}
        disabled={sending}
      />
      <input type="file" aria-label="Attach a file" onChange={handleFilePick} disabled={sending} />
      <button onClick={handleSend} disabled={sending || !text.trim()}>
        Send
      </button>
      {fileStage && fileStage !== "sent" && <p data-testid="file-stage">{fileStage}...</p>}
      {fileError && <p role="alert">{fileError}</p>}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
