import { useEffect, useState } from "react";
import { loadNickname } from "../storage/nicknameStore";

interface IncomingChatsProps {
  pendingChats: string[];
  onOpen: (contactId: string) => void;
}

function IncomingChatRow({ contactId, onOpen }: { contactId: string; onOpen: (contactId: string) => void }) {
  const [nickname, setNickname] = useState<string>();

  useEffect(() => {
    loadNickname(contactId).then(setNickname);
  }, [contactId]);

  return (
    <li className="list-row" data-testid="incoming-chat-row">
      <span className="list-row-label chip">{nickname ?? contactId}</span>
      <button onClick={() => onOpen(contactId)}>Open</button>
    </li>
  );
}

/** Only rendered when non-empty - a transient "someone's trying to reach you"
 * notice, not a standing section like Groups/LinkedDevices. */
export function IncomingChats({ pendingChats, onOpen }: IncomingChatsProps) {
  if (pendingChats.length === 0) return null;

  return (
    <section className="panel stack" data-testid="incoming-chats">
      <h2>New Messages</h2>
      <ul>
        {pendingChats.map((contactId) => (
          <IncomingChatRow key={contactId} contactId={contactId} onOpen={onOpen} />
        ))}
      </ul>
    </section>
  );
}
