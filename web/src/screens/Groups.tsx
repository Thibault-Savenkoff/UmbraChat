import { useState } from "react";
import type { Group } from "../chat/group";

interface GroupsProps {
  groups: Group[];
  onCreateGroup: (name: string, memberAccountIds: string[]) => void;
  onOpenGroup: (groupId: string) => void;
  creating: boolean;
  error?: string;
}

export function Groups({ groups, onCreateGroup, onOpenGroup, creating, error }: GroupsProps) {
  const [name, setName] = useState("");
  const [members, setMembers] = useState("");

  function handleCreate() {
    const memberAccountIds = members
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    onCreateGroup(name.trim(), memberAccountIds);
    setName("");
    setMembers("");
  }

  return (
    <section>
      <h2>Groups</h2>
      <ul data-testid="group-list">
        {groups.map((g) => (
          <li key={g.id} data-testid="group-row">
            {g.name}
            <button onClick={() => onOpenGroup(g.id)}>Open</button>
          </li>
        ))}
      </ul>
      <input placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} disabled={creating} />
      <input placeholder="Member account IDs, comma-separated" value={members} onChange={(e) => setMembers(e.target.value)} disabled={creating} />
      <button onClick={handleCreate} disabled={creating || !name.trim() || !members.trim()}>
        Create Group
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
