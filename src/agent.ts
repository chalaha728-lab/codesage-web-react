// The CodeSage agent reasoning engine.
//
// Supports both a local deterministic skill engine (arithmetic, unit conversion,
// date/time, jokes, definitions) and an optional remote OpenAI-compatible LLM endpoint.

import type { AgentSettings, AgentSkill, ChatMessage } from "./types";

export interface AgentResult {
  content: string;
  reasoning: string[];
}

export const AGENT_SKILLS: AgentSkill[] = [
  { id: "math", label: "Math", description: "Arithmetic & expressions", icon: "➗" },
  { id: "convert", label: "Convert", description: "Length, weight, temperature", icon: "🔁" },
  { id: "time", label: "Time", description: "Date, time & days until", icon: "🕒" },
  { id: "joke", label: "Jokes", description: "Tell a programming joke", icon: "😄" },
  { id: "define", label: "Define", description: "Look up a word", icon: "📖" },
  { id: "chat", label: "Chat", description: "General conversation", icon: "💬" },
];

const JOKES: string[] = [
  "Why do programmers prefer dark mode? Because light attracts bugs.",
  "There are only 10 types of people in the world: those who understand binary and those who don't.",
  "How many programmers does it take to change a light bulb? None — that's a hardware problem.",
  "A SQL query walks into a bar, approaches two tables and asks: 'Can I join you?'",
  "Debugging: being the detective in a crime movie where you are also the murderer.",
  "Why did the developer go broke? Because they used up all their cache.",
];

interface ConvertFactor {
  aliases: string[];
  /** factor to convert a unit into a base unit */
  toBase: (v: number) => number;
  fromBase: (v: number) => number;
  base: string;
}

const LENGTH: ConvertFactor[] = [
  { aliases: ["mm", "millimeter", "millimeters"], toBase: (v) => v / 1000, fromBase: (v) => v * 1000, base: "m" },
  { aliases: ["cm", "centimeter", "centimeters"], toBase: (v) => v / 100, fromBase: (v) => v * 100, base: "m" },
  { aliases: ["m", "meter", "meters"], toBase: (v) => v, fromBase: (v) => v, base: "m" },
  { aliases: ["km", "kilometer", "kilometers"], toBase: (v) => v * 1000, fromBase: (v) => v / 1000, base: "m" },
  { aliases: ["in", "inch", "inches"], toBase: (v) => v * 0.0254, fromBase: (v) => v / 0.0254, base: "m" },
  { aliases: ["ft", "foot", "feet"], toBase: (v) => v * 0.3048, fromBase: (v) => v / 0.3048, base: "m" },
  { aliases: ["mi", "mile", "miles"], toBase: (v) => v * 1609.344, fromBase: (v) => v / 1609.344, base: "m" },
];

const WEIGHT: ConvertFactor[] = [
  { aliases: ["mg", "milligram", "milligrams"], toBase: (v) => v / 1_000_000, fromBase: (v) => v * 1_000_000, base: "kg" },
  { aliases: ["g", "gram", "grams"], toBase: (v) => v / 1000, fromBase: (v) => v * 1000, base: "kg" },
  { aliases: ["kg", "kilogram", "kilograms"], toBase: (v) => v, fromBase: (v) => v, base: "kg" },
  { aliases: ["lb", "lbs", "pound", "pounds"], toBase: (v) => v * 0.45359237, fromBase: (v) => v / 0.45359237, base: "kg" },
  { aliases: ["oz", "ounce", "ounces"], toBase: (v) => v * 0.028349523125, fromBase: (v) => v / 0.028349523125, base: "kg" },
];

const UNITS = [...LENGTH, ...WEIGHT];

function findUnit(name: string): ConvertFactor | undefined {
  const n = name.toLowerCase().replace(/\.$/, "");
  return UNITS.find((u) => u.aliases.includes(n));
}

function tryArithmetic(input: string): number | null {
  const expr = input.replace(/[^0-9+\-*/().\s]/g, "").trim();
  if (!expr || !/[+\-*/]/.test(expr)) return null;
  if (!/^[0-9+\-*/().\s]+$/.test(expr)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr});`)();
    if (typeof result === "number" && Number.isFinite(result)) return result;
  } catch {
    return null;
  }
  return null;
}

function tryConversion(input: string): string | null {
  const m = input.match(/([\d.]+)\s*([a-z]+)\s*(?:to|in)\s*([a-z]+)/i);
  if (!m) return null;
  const value = parseFloat(m[1]);
  const from = findUnit(m[2]);
  const to = findUnit(m[3]);
  if (!from || !to || from.base !== to.base) return null;
  const base = from.toBase(value);
  const out = to.fromBase(base);
  const formatted = Number(out.toFixed(6)).toString();
  return `${value} ${from.aliases[0]} = ${formatted} ${to.aliases[0]}`;
}

function tryTemperature(input: string): string | null {
  const m = input.match(/([\d.]+)\s*(c|celsius|f|fahrenheit)\s*(?:to|in)\s*(c|celsius|f|fahrenheit)/i);
  if (!m) return null;
  const value = parseFloat(m[1]);
  const from = m[2].toLowerCase();
  const to = m[3].toLowerCase();
  let celsius: number;
  if (from.startsWith("c")) celsius = value;
  else celsius = (value - 32) * (5 / 9);
  const out = to.startsWith("c") ? celsius : celsius * (9 / 5) + 32;
  const formatted = Number(out.toFixed(2)).toString();
  const toLabel = to.startsWith("c") ? "°C" : "°F";
  const fromLabel = from.startsWith("c") ? "°C" : "°F";
  return `${value}${fromLabel} = ${formatted}${toLabel}`;
}

function tryTime(input: string): string | null {
  const lower = input.toLowerCase();
  if (/\b(what|which)\b.*\b(date|day)\b.*today\b/.test(lower) || lower.includes("today's date")) {
    const now = new Date();
    return `Today is ${now.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`;
  }
  if (/\bwhat time\b/.test(lower) || lower.includes("current time")) {
    return `The current time is ${new Date().toLocaleTimeString()}.`;
  }
  const until = lower.match(/how many days until (.+)/);
  if (until) {
    const target = new Date(until[1]);
    if (!Number.isNaN(target.getTime())) {
      const ms = target.getTime() - Date.now();
      const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
      return `There ${days >= 0 ? "are" : "were"} ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ${days >= 0 ? "until" : "since"} ${target.toLocaleDateString()}.`;
    }
  }
  return null;
}

function tryJoke(input: string): string | null {
  const lower = input.toLowerCase();
  if (/\bjoke\b/.test(lower) || /\bmake me laugh\b/.test(lower)) {
    return JOKES[Math.floor(Math.random() * JOKES.length)];
  }
  return null;
}

function tryDefine(input: string): string | null {
  const m = input.toLowerCase().match(/\b(?:define|meaning of|what is|what's)\b\s+(?:a|an|the)?\s*([a-z]{2,})/);
  if (!m) return null;
  const word = m[1];
  const GLOSSARY: Record<string, string> = {
    agent: "A software component that perceives its environment and takes actions to achieve a goal.",
    api: "Application Programming Interface — a set of rules allowing software to communicate.",
    react: "A JavaScript library for building user interfaces using components.",
    algorithm: "A finite sequence of well-defined instructions to solve a problem.",
    variable: "A named storage location in a program that holds a value.",
    recursion: "A technique where a function calls itself to solve smaller sub-problems.",
    compile: "To translate source code into an executable form a machine can run.",
    deploy: "To make software available for use, often on servers or app stores.",
  };
  if (word in GLOSSARY) return `${capitalize(word)}: ${GLOSSARY[word]}`;
  return `I don't have a built-in definition for "${word}" in my offline glossary, but it's a great word to look up!`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function tryConversation(input: string, history: string[]): string | null {
  const lower = input.toLowerCase().trim();
  if (/\b(hi|hello|hey|yo|howdy)\b/.test(lower) && lower.length <= 12) {
    return "Hello! I'm CodeSage, your in-browser AI agent. Ask me to do math, convert units, check the date, tell a joke, or configure a real LLM in Settings.";
  }
  if (lower.includes("how are you")) {
    return "I'm running at full clock — all systems nominal! How can I help you today?";
  }
  if (/\b(who are you|what are you)\b/.test(lower)) {
    return "I'm CodeSage — a transparent AI agent built with React. You can use my built-in skills or connect an LLM API in Settings.";
  }
  if (/\b(thanks|thank you|thx)\b/.test(lower)) {
    return "You're welcome! Anything else I can help with?";
  }
  if (lower.includes("your name")) {
    return "My name is CodeSage. Nice to meet you!";
  }
  if (/\b(bye|goodbye|see you|see ya)\b/.test(lower)) {
    return "Goodbye! Come back anytime.";
  }
  if (history.length > 0) {
    const lastUser = history.filter((h) => h).slice(-1)[0] ?? "";
    if (lower.includes("that") || lower.includes("it") || lower.includes("this")) {
      return `Building on your earlier message ("${lastUser.slice(0, 60)}${lastUser.length > 60 ? "…" : ""}"), I'm tracking the context. What specifically would you like me to do with it?`;
    }
  }
  if (lower.includes("help") || lower.includes("what can you do")) {
    return "I can: do math (e.g. '12 * (3 + 4)'), convert units ('5 km to miles'), handle temperature ('100 c to f'), tell you the date/time, count days until a date, tell a joke, define coding terms, or connect to a real LLM API (OpenAI/Groq/Ollama/OpenRouter).";
  }
  return null;
}

const FALLBACKS: string[] = [
  "That's an interesting query. I'm operating on local skills. Try a math expression, unit conversion, or configure a real LLM in Settings ⚙️!",
  "I don't have a local skill for that specific request. You can configure a remote LLM API (OpenAI, Groq, Ollama) in Settings ⚙️ to get full AI answers!",
  "Hmm, my local skills didn't match that query. Try math, conversions, jokes, or connect your preferred LLM model in Settings ⚙️.",
];

export function runAgentLocal(input: string, priorUserMessages: string[] = []): AgentResult {
  const reasoning: string[] = [];
  const trimmed = input.trim();
  reasoning.push(`[Local Skill Engine] Processing message (${trimmed.length} chars).`);

  const math = tryArithmetic(trimmed);
  if (math !== null) {
    reasoning.push("Matched math skill — evaluated arithmetic expression.");
    return { content: `That equals **${math}**.`, reasoning };
  }

  const temp = tryTemperature(trimmed);
  if (temp) {
    reasoning.push("Matched temperature conversion skill.");
    return { content: temp, reasoning };
  }

  const conv = tryConversion(trimmed);
  if (conv) {
    reasoning.push("Matched unit conversion skill.");
    return { content: conv, reasoning };
  }

  const time = tryTime(trimmed);
  if (time) {
    reasoning.push("Matched date/time skill.");
    return { content: time, reasoning };
  }

  const joke = tryJoke(trimmed);
  if (joke) {
    reasoning.push("Matched joke skill.");
    return { content: joke, reasoning };
  }

  const def = tryDefine(trimmed);
  if (def) {
    reasoning.push("Matched definition glossary skill.");
    return { content: def, reasoning };
  }

  const chat = tryConversation(trimmed, priorUserMessages);
  if (chat) {
    reasoning.push("Matched conversational rules.");
    return { content: chat, reasoning };
  }

  reasoning.push("No local skill matched — returning guided fallback.");
  return { content: FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)], reasoning };
}

async function callRemoteLLM(
  messages: ChatMessage[],
  settings: AgentSettings
): Promise<AgentResult> {
  const reasoning: string[] = [
    `[Remote LLM] Connecting to ${settings.baseUrl} (model: ${settings.model || "default"})`,
  ];

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (settings.apiKey) {
    headers["Authorization"] = `Bearer ${settings.apiKey}`;
  }

  const body = {
    model: settings.model || "gpt-4o-mini",
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  };

  const endpoint = settings.baseUrl.endsWith("/chat/completions")
    ? settings.baseUrl
    : `${settings.baseUrl.replace(/\/$/, "")}/chat/completions`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`API Request failed (${response.status}): ${errorText.slice(0, 150)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Received empty response from LLM API.");
  }

  reasoning.push(`[Remote LLM] Successfully received response from ${settings.model || "model"}.`);
  return { content, reasoning };
}

export async function runAgent(
  messages: ChatMessage[],
  settings: AgentSettings
): Promise<AgentResult> {
  const lastMsg = messages.filter((m) => m.role === "user").slice(-1)[0];
  const input = lastMsg?.content ?? "";
  const priorUserMessages = messages
    .filter((m) => m.role === "user")
    .slice(0, -1)
    .map((m) => m.content);

  if (settings.useRemote && (settings.apiKey || settings.provider === "ollama")) {
    try {
      return await callRemoteLLM(messages, settings);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const fallback = runAgentLocal(input, priorUserMessages);
      return {
        content: `⚠️ **Remote LLM Call Failed:** ${errorMsg}\n\n*Fell back to local skill engine:*\n\n${fallback.content}`,
        reasoning: [
          `[Remote LLM Error] ${errorMsg}`,
          "Fell back to local skill engine.",
          ...fallback.reasoning,
        ],
      };
    }
  }

  return runAgentLocal(input, priorUserMessages);
}

export function titleFromMessage(message: string): string {
  const clean = message.trim().replace(/\s+/g, " ");
  if (clean.length <= 32) return clean || "New chat";
  return clean.slice(0, 30).trimEnd() + "…";
}
