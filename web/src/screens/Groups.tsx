import { useState } from "react";
import type { Group } from "../chat/group";

interface GroupsProps {
  groups: Group[];
  ownAccountId: string;
  onCreateGroup: (name: string, memberAccountIds: string[]) => void;
  onOpenGroup: (groupId: string) => void;
  creating: boolean;
  error?: string;
}

export function Groups({ groups, ownAccountId, onCreateGroup, onOpenGroup, creating, error }: GroupsProps) {
  const [name, setName] = useState("");
  const [members, setMembers] = useState("");

  function handleCreate() {
    // createGroup already adds the caller to the roster itself - this field
    // is for everyone *else*, so a redundant self-id here would duplicate
    // the caller and try to fan the invite out to themselves.
    const memberAccountIds = members
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id && id !== ownAccountId);
    onCreateGroup(name.trim(), memberAccountIds);
    setName("");
    setMembers("");
  }

  return (
    <section className="panel stack">
      <h2>Groups</h2>
      <ul data-testid="group-list">
        {groups.length === 0 && <li className="list-empty">No groups yet.</li>}
        {groups.map((g) => (
          <li key={g.id} className="list-row" data-testid="group-row">
            <span className="list-row-label">{g.name}</span>
            <button className="secondary" onClick={() => onOpenGroup(g.id)}>
              Open
            </button>
          </li>
        ))}
      </ul>
      <input placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} disabled={creating} />
      <input placeholder="Member account IDs, comma-separated" value={members} onChange={(e) => setMembers(e.target.value)} disabled={creating} />
      <button className="secondary" onClick={handleCreate} disabled={creating || !name.trim() || !members.trim()}>
        Create Group
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
