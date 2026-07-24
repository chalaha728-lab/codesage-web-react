import { useState } from "react";
import type { ChatMessage as ChatMessageType } from "../types";

interface Props {
  message: ChatMessageType;
  streaming?: boolean;
  onRegenerate?: () => void;
  canRegenerate?: boolean;
}

/** Render markdown-ish bold (**text**) as <strong> without dangerouslySetInnerHTML. */
function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(<strong key={key++}>{match[1]}</strong>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

export default function ChatMessage({ message, streaming, onRegenerate, canRegenerate }: Props) {
  const [showReasoning, setShowReasoning] = useState(false);
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const avatar = isUser ? "🧑" : "🤖";
  const name = isUser ? "You" : "CodeSage";

  return (
    <div className={`msg ${isUser ? "msg-user" : "msg-assistant"}`}>
      <div className="msg-avatar" aria-hidden="true">
        {avatar}
      </div>
      <div className="msg-body">
        <div className="msg-header">
          <span className="msg-name">{name}</span>
          <span className="msg-time">{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>

        <div className="msg-content">
          {renderInline(message.content)}
          {streaming ? <span className="cursor">▋</span> : null}
        </div>

        {!isUser && message.reasoning && message.reasoning.length > 0 && (
          <div className="msg-extras">
            <button
              type="button"
              className="link-btn"
              onClick={() => setShowReasoning((s) => !s)}
              aria-expanded={showReasoning}
            >
              {showReasoning ? "▾" : "▸"} Reasoning ({message.reasoning.length} steps)
            </button>
            {showReasoning && (
              <ol className="reasoning">
                {message.reasoning.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            )}
          </div>
        )}

        {!isUser && !streaming && (
          <div className="msg-actions">
            <button type="button" className="chip" onClick={handleCopy}>
              {copied ? "✓ Copied" : "⧉ Copy"}
            </button>
            {canRegenerate && (
              <button type="button" className="chip" onClick={onRegenerate}>
                ⟳ Regenerate
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
