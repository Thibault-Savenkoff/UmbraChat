interface IncomingChatsProps {
  pendingChats: string[];
  onOpen: (contactId: string) => void;
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
          <li key={contactId} className="list-row" data-testid="incoming-chat-row">
            <span className="list-row-label chip">{contactId}</span>
            <button onClick={() => onOpen(contactId)}>Open</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
