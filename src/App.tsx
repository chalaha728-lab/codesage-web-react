import { useEffect, useRef, useState } from "react";
import Sidebar from "./components/Sidebar";
import ChatMessage from "./components/ChatMessage";
import ChatInput from "./components/ChatInput";
import { useChat } from "./hooks/useChat";

const SUGGESTIONS: string[] = [
  "What's 18 * (7 + 4)?",
  "Convert 5 km to miles",
  "How many days until 2026-12-31?",
  "Tell me a joke",
  "Define recursion",
  "What can you do?",
];

export default function App() {
  const {
    conversations,
    active,
    activeId,
    streamingId,
    isStreaming,
    selectConversation,
    newConversation,
    deleteConversation,
    clearAll,
    send,
    regenerate,
    stop,
  } = useChat();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [active?.messages, streamingId]);

  const lastAssistantId =
    active?.messages.filter((m) => m.role === "assistant").slice(-1)[0]?.id ?? null;

  return (
    <div className="app-shell">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={(id) => {
          selectConversation(id);
          setSidebarOpen(false);
        }}
        onNew={() => {
          newConversation();
          setSidebarOpen(false);
        }}
        onDelete={deleteConversation}
        onClearAll={clearAll}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="chat-main">
        <header className="chat-header">
          <button
            type="button"
            className="icon-btn menu-btn"
            onClick={() => setSidebarOpen((o) => !o)}
            aria-label="Toggle sidebar"
          >
            ☰
          </button>
          <div className="header-title">
            <span className="header-mark">✦</span>
            <h1>{active?.title ?? "CodeSage"}</h1>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => newConversation()}
            aria-label="New chat"
            title="New chat"
          >
            ✎
          </button>
        </header>

        <div className="messages" ref={scrollRef}>
          {!active || active.messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-logo">✦</div>
              <h2>CodeSage</h2>
              <p className="welcome-sub">
                A transparent, in-browser AI agent. Ask me anything — I'll show my reasoning.
              </p>
              <div className="welcome-grid">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="welcome-card"
                    onClick={() => send(s)}
                    disabled={isStreaming}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            active.messages.map((m) => (
              <ChatMessage
                key={m.id}
                message={m}
                streaming={m.id === streamingId}
                canRegenerate={m.id === lastAssistantId && !isStreaming}
                onRegenerate={regenerate}
              />
            ))
          )}
        </div>

        <ChatInput
          onSend={send}
          onStop={stop}
          busy={isStreaming}
          suggestions={active && active.messages.length === 0 ? SUGGESTIONS : []}
        />
      </main>
    </div>
  );
}
