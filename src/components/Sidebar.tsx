import type { Conversation } from "../types";
import { AGENT_SKILLS } from "../agent";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onClearAll,
  open,
  onClose,
}: Props) {
  return (
    <>
      {open && <div className="scrim" onClick={onClose} aria-hidden="true" />}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`} aria-label="Conversations">
        <div className="sidebar-head">
          <div className="brand">
            <span className="brand-mark">✦</span>
            <span className="brand-name">CodeSage</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close sidebar">
            ✕
          </button>
        </div>

        <button type="button" className="new-chat-btn" onClick={onNew}>
          + New chat
        </button>

        <nav className="conv-list">
          {conversations.length === 0 && (
            <p className="empty-hint">No conversations yet.</p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`conv-item ${c.id === activeId ? "conv-active" : ""}`}
            >
              <button type="button" className="conv-title" onClick={() => onSelect(c.id)}>
                <span className="conv-dot" />
                <span className="conv-text">{c.title}</span>
              </button>
              <button
                type="button"
                className="conv-del"
                onClick={() => onDelete(c.id)}
                aria-label="Delete conversation"
                title="Delete"
              >
                🗑
              </button>
            </div>
          ))}
        </nav>

        <div className="skills-block">
          <p className="skills-title">Agent skills</p>
          <ul className="skills-list">
            {AGENT_SKILLS.map((s) => (
              <li key={s.id} className="skill" title={s.description}>
                <span className="skill-icon">{s.icon}</span>
                <span className="skill-label">{s.label}</span>
              </li>
            ))}
          </ul>
        </div>

        {conversations.length > 0 && (
          <button type="button" className="clear-all" onClick={onClearAll}>
            Clear all conversations
          </button>
        )}

        <footer className="sidebar-foot">
          <span>CodeSage · offline agent demo</span>
        </footer>
      </aside>
    </>
  );
}
