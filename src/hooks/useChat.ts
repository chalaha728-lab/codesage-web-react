import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentSettings, ChatMessage, Conversation } from "../types";
import { runAgent, titleFromMessage } from "../agent";
import { loadSettings, saveSettings } from "../storage";

const STORAGE_KEY = "codesage.conversations.v1";

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function load(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>(() => load());
  const [activeId, setActiveId] = useState<string | null>(() => load()[0]?.id ?? null);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AgentSettings>(() => loadSettings());
  const stopRef = useRef(false);
  const streamTimer = useRef<number | null>(null);

  // Persist whenever conversations change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    } catch {
      /* storage full / unavailable */
    }
  }, [conversations]);

  // Persist settings
  const updateSettings = useCallback((newSettings: AgentSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  }, []);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  const patchConversation = useCallback(
    (id: string, updater: (c: Conversation) => Conversation) => {
      setConversations((prev) => prev.map((c) => (c.id === id ? updater(c) : c)));
    },
    []
  );

  const newConversation = useCallback(() => {
    const conv: Conversation = {
      id: uid(),
      title: "New chat",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    return conv.id;
  }, []);

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== id);
        setActiveId((curr) => (curr === id ? next[0]?.id ?? null : curr));
        return next;
      });
    },
    []
  );

  const clearAll = useCallback(() => {
    setConversations([]);
    setActiveId(null);
  }, []);

  /** Stream an assistant message token-by-token to simulate live generation. */
  const streamAssistant = useCallback(
    async (convId: string, fullText: string, reasoning: string[]) => {
      const msgId = uid();
      const baseMsg: ChatMessage = {
        id: msgId,
        role: "assistant",
        content: "",
        createdAt: Date.now(),
        reasoning,
      };
      patchConversation(convId, (c) => ({
        ...c,
        messages: [...c.messages, baseMsg],
        updatedAt: Date.now(),
      }));
      setStreamingId(msgId);
      stopRef.current = false;

      // Reveal text in small chunks for a typing effect.
      const tokens = fullText.split(/(\s+)/);
      let acc = "";
      for (let i = 0; i < tokens.length; i++) {
        if (stopRef.current) break;
        acc += tokens[i];
        const snapshot = acc;
        patchConversation(convId, (c) => ({
          ...c,
          messages: c.messages.map((m) => (m.id === msgId ? { ...m, content: snapshot } : m)),
        }));
        // delay between tokens; small jitter feels natural
        await new Promise<void>((resolve) => {
          streamTimer.current = window.setTimeout(resolve, 14 + Math.random() * 20);
        });
      }

      if (stopRef.current && acc.length < fullText.length) {
        const final = acc + " …";
        patchConversation(convId, (c) => ({
          ...c,
          messages: c.messages.map((m) => (m.id === msgId ? { ...m, content: final } : m)),
        }));
      }

      setStreamingId(null);
    },
    [patchConversation]
  );

  const send = useCallback(
    async (text: string) => {
      let convId = activeId;
      if (!convId) convId = newConversation();

      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: text,
        createdAt: Date.now(),
      };

      const currentConv = conversations.find((c) => c.id === convId);
      const existingMsgs = currentConv?.messages ?? [];
      const isFirst = existingMsgs.length === 0;

      const updatedMsgs = [...existingMsgs, userMsg];

      patchConversation(convId, (c) => ({
        ...c,
        title: isFirst ? titleFromMessage(text) : c.title,
        messages: updatedMsgs,
        updatedAt: Date.now(),
      }));

      const { content, reasoning } = await runAgent(updatedMsgs, settings);
      await streamAssistant(convId, content, reasoning);
    },
    [activeId, conversations, newConversation, patchConversation, settings, streamAssistant]
  );

  const regenerate = useCallback(async () => {
    if (!active) return;
    const msgs = active.messages;
    let lastUserIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;

    const msgsForAgent = msgs.slice(0, lastUserIdx + 1);

    patchConversation(active.id, (c) => ({
      ...c,
      messages: msgsForAgent,
      updatedAt: Date.now(),
    }));

    const { content, reasoning } = await runAgent(msgsForAgent, settings);
    await streamAssistant(active.id, content, reasoning);
  }, [active, patchConversation, settings, streamAssistant]);

  const stop = useCallback(() => {
    stopRef.current = true;
    if (streamTimer.current) window.clearTimeout(streamTimer.current);
    setStreamingId(null);
  }, []);

  return {
    conversations,
    active,
    activeId,
    streamingId,
    isStreaming: streamingId !== null,
    settings,
    updateSettings,
    selectConversation: setActiveId,
    newConversation,
    deleteConversation,
    clearAll,
    send,
    regenerate,
    stop,
  };
}
