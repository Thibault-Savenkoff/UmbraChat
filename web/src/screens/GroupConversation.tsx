import { useState } from "react";
import type { Group } from "../chat/group";
import type { ChatMessage } from "../storage/messageStore";
import type { LocalAccount } from "../storage/keyStore";

interface GroupConversationProps {
  group: Group;
  account: LocalAccount;
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onRemoveMember: (memberAccountId: string) => void;
  sending: boolean;
  error?: string;
}

export function GroupConversation({ group, account, messages, onSend, onRemoveMember, sending, error }: GroupConversationProps) {
  const [text, setText] = useState("");

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <main>
      <h1>{group.name}</h1>
      <ul data-testid="group-message-list">
        {messages.map((m) => (
          <li key={m.id} data-testid="group-message">
            {m.direction === "received" ? `${m.senderAccountId}: ` : ""}
            {m.text}
          </li>
        ))}
      </ul>
      <ul data-testid="group-member-list">
        {group.memberAccountIds.map((id) => (
          <li key={id} data-testid="group-member">
            {id}
            {id !== account.accountId && <button onClick={() => onRemoveMember(id)}>Remove</button>}
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
