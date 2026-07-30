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
  onBack: () => void;
  sending: boolean;
  error?: string;
}

export function GroupConversation({ group, account, messages, onSend, onRemoveMember, onBack, sending, error }: GroupConversationProps) {
  const [text, setText] = useState("");

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <main className="convo screen">
      <div className="convo-toolbar">
        <button className="secondary" onClick={onBack} aria-label="Back to menu">
          ← Menu
        </button>
        <h1>{group.name}</h1>
      </div>

      <ul className="message-list" data-testid="group-message-list">
        {messages.length === 0 && <li className="message-list-empty">No messages yet - say hi.</li>}
        {messages.map((m) => (
          <li key={m.id} className={m.direction === "sent" ? "group-message-sent" : "group-message-received"} data-testid="group-message">
            {m.direction === "received" ? <span className="status">{m.senderAccountId}: </span> : null}
            {m.text}
          </li>
        ))}
      </ul>

      <section className="panel stack">
        <h2>Members</h2>
        <ul data-testid="group-member-list">
          {group.memberAccountIds.map((id) => (
            <li key={id} className="list-row" data-testid="group-member">
              <span className="list-row-label chip">{id}</span>
              {id !== account.accountId && (
                <button className="danger" onClick={() => onRemoveMember(id)}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="composer">
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
      </div>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
