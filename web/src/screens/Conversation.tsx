import { useState } from "react";
import type { ChatMessage } from "../storage/messageStore";

interface ConversationProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  sending: boolean;
  error?: string;
}

export function Conversation({ messages, onSend, sending, error }: ConversationProps) {
  const [text, setText] = useState("");

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <main>
      <h1>Conversation</h1>
      <ul data-testid="message-list">
        {messages.map((m) => (
          <li key={m.id} data-testid={`message-${m.direction}`}>
            <span>{m.text}</span>
            {m.direction === "sent" && <span data-testid="message-status"> ({m.status})</span>}
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
      <button onClick={handleSend} disabled={sending || !text.trim()}>
        Send
      </button>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
