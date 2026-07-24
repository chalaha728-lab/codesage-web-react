import type { AgentSettings } from "./types";

const SETTINGS_KEY = "codesage.settings.v1";

export const DEFAULT_SETTINGS: AgentSettings = {
  useRemote: false,
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
};

export const PROVIDER_PRESETS: Record<
  string,
  { label: string; baseUrl: string; defaultModel: string; needsKey: boolean }
> = {
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    needsKey: true,
  },
  groq: {
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.1-8b-instant",
    needsKey: true,
  },
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "auto",
    needsKey: true,
  },
  ollama: {
    label: "Ollama (Local)",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3",
    needsKey: false,
  },
  custom: {
    label: "Custom OpenAI-Compatible",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    needsKey: true,
  },
};

export function loadSettings(): AgentSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AgentSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage full or unavailable */
  }
}
