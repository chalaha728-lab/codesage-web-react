import { useEffect, useRef, useState } from "react";

interface Props {
  onSend: (text: string) => void;
  onStop?: () => void;
  busy: boolean;
  suggestions?: string[];
}

export default function ChatInput({ onSend, onStop, busy, suggestions = [] }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea up to a max height.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [value]);

  const submit = () => {
    const text = value.trim();
    if (!text || busy) return;
    onSend(text);
    setValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="chat-input">
      {suggestions.length > 0 && (
        <div className="suggestions">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="suggestion"
              onClick={() => onSend(s)}
              disabled={busy}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="input-row">
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder="Ask CodeSage anything…  (Enter to send, Shift+Enter for newline)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={busy}
        />
        {busy ? (
          <button type="button" className="send-btn stop" onClick={onStop} aria-label="Stop">
            ■
          </button>
        ) : (
          <button
            type="button"
            className="send-btn"
            onClick={submit}
            disabled={!value.trim()}
            aria-label="Send"
          >
            ➤
          </button>
        )}
      </div>
    </div>
  );
}
