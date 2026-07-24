import { useState } from "react";
import type { ReactNode } from "react";
import type { ChatMessage as ChatMessageType } from "../types";

interface Props {
  message: ChatMessageType;
  streaming?: boolean;
  onRegenerate?: () => void;
  canRegenerate?: boolean;
}

/** Render markdown-ish bold (**text**), inline code (`code`), and code blocks (```) without dangerouslySetInnerHTML. */
function renderFormattedContent(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const codeBlockRegex = /```(?:[a-z]*\n)?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(...renderInline(text.slice(lastIndex, match.index), key));
      key += 100;
    }
    parts.push(
      <pre key={`block_${key++}`} className="code-block">
        <code>{match[1].trim()}</code>
      </pre>
    );
    lastIndex = codeBlockRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(...renderInline(text.slice(lastIndex), key));
  }

  return parts;
}

function renderInline(text: string, baseKey: number): ReactNode[] {
  const parts: ReactNode[] = [];
  const inlineRegex = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = baseKey;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      // Bold **text**
      parts.push(<strong key={`b_${key++}`}>{match[2]}</strong>);
    } else if (match[3]) {
      // Inline `code`
      parts.push(<code key={`c_${key++}`} className="inline-code">{match[3]}</code>);
    }
    lastIndex = inlineRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

export default function ChatMessage({ message, streaming, onRegenerate, canRegenerate }: Props) {
  const [showReasoning, setShowReasoning] = useState(false);
  const [showTools, setShowTools] = useState(true);
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

        {!isUser && message.toolsUsed && message.toolsUsed.length > 0 && (
          <div className="tools-badge-container">
            <button
              type="button"
              className="tools-toggle-btn"
              onClick={() => setShowTools((s) => !s)}
            >
              🛠️ Executed {message.toolsUsed.length} Agent Tool{message.toolsUsed.length > 1 ? "s" : ""} {showTools ? "▾" : "▸"}
            </button>
            {showTools && (
              <div className="tools-list">
                {message.toolsUsed.map((tool) => (
                  <div key={tool.id} className="tool-card">
                    <div className="tool-card-header">
                      <span className="tool-name">⚡ {tool.toolName}</span>
                      <span className="tool-status">✓ Completed</span>
                    </div>
                    {tool.args && Object.keys(tool.args).length > 0 && (
                      <pre className="tool-args">
                        {JSON.stringify(tool.args, null, 2)}
                      </pre>
                    )}
                    {tool.result && (
                      <div className="tool-result">
                        <small>Output:</small>
                        <pre>{tool.result}</pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="msg-content">
          {renderFormattedContent(message.content)}
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
