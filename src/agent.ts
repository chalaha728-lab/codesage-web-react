// The CodeSage agent reasoning engine.
//
// This is a fully self-contained, deterministic agent (no external API/keys
// required) so the app works as a live demo. It routes a user's message
// through a set of skills: arithmetic, unit conversion, date/time, jokes,
// definitions, and a conversational fallback. Each step records a short
// "reasoning" trace that the UI can surface as transparent thinking.

import type { AgentSkill } from "./types";

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

// A small, safe arithmetic evaluator using the Function constructor on a
// restricted character set. We reject anything that isn't digits, operators,
// parentheses, decimal points and spaces. This keeps arbitrary code out.
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
    return "Hello! I'm CodeSage, your in-browser AI agent. Ask me to do math, convert units, check the date, tell a joke, or just chat.";
  }
  if (lower.includes("how are you")) {
    return "I'm running at full clock — all systems nominal! How can I help you today?";
  }
  if (/\b(who are you|what are you)\b/.test(lower)) {
    return "I'm CodeSage — a transparent, offline AI agent demo built with React. I show my reasoning steps so you can see how I think.";
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
  // Reference earlier conversation context.
  if (history.length > 0) {
    const lastUser = history.filter((h) => h).slice(-1)[0] ?? "";
    if (lower.includes("that") || lower.includes("it") || lower.includes("this")) {
      return `Building on your earlier message ("${lastUser.slice(0, 60)}${lastUser.length > 60 ? "…" : ""}"), I'm tracking the context. What specifically would you like me to do with it?`;
    }
  }
  if (lower.includes("help") || lower.includes("what can you do")) {
    return "I can: do math (e.g. '12 * (3 + 4)'), convert units (e.g. '5 km to miles'), handle temperature ('100 c to f'), tell you the date/time, count days until a date, tell a joke, define coding terms, and chat. Try one!";
  }
  return null;
}

const FALLBACKS: string[] = [
  "That's an interesting one. Could you rephrase or give me more detail so I can help precisely?",
  "I'm not totally sure I caught that. I'm best at math, conversions, time, jokes and definitions — want to try one of those?",
  "Hmm, I don't have a specific skill for that yet, but I'm all ears. What are you trying to accomplish?",
];

/**
 * Run the agent against a single user message.
 * @param input the user's message
 * @param priorUserMessages recent user messages, for context
 */
export function runAgent(input: string, priorUserMessages: string[] = []): AgentResult {
  const reasoning: string[] = [];
  const trimmed = input.trim();
  reasoning.push(`Received message (${trimmed.length} chars).`);

  // 1. Math
  const math = tryArithmetic(trimmed);
  if (math !== null) {
    reasoning.push("Matched the arithmetic skill — evaluated the expression safely.");
    return { content: `That equals **${math}**.`, reasoning };
  }

  // 2. Temperature
  const temp = tryTemperature(trimmed);
  if (temp) {
    reasoning.push("Matched the temperature conversion skill.");
    return { content: temp, reasoning };
  }

  // 3. Unit conversion
  const conv = tryConversion(trimmed);
  if (conv) {
    reasoning.push("Matched the unit-conversion skill.");
    return { content: conv, reasoning };
  }

  // 4. Time
  const time = tryTime(trimmed);
  if (time) {
    reasoning.push("Matched the date/time skill — computed using the system clock.");
    return { content: time, reasoning };
  }

  // 5. Joke
  const joke = tryJoke(trimmed);
  if (joke) {
    reasoning.push("Matched the joke skill — picked a random entry from the set.");
    return { content: joke, reasoning };
  }

  // 6. Define
  const def = tryDefine(trimmed);
  if (def) {
    reasoning.push("Matched the define skill — looked up the offline glossary.");
    return { content: def, reasoning };
  }

  // 7. Conversational
  const chat = tryConversation(trimmed, priorUserMessages);
  if (chat) {
    reasoning.push("Matched a conversational rule.");
    return { content: chat, reasoning };
  }

  reasoning.push("No skill matched — returning a guided fallback.");
  return { content: FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)], reasoning };
}

/**
 * Derive a short title for a conversation from its first user message.
 */
export function titleFromMessage(message: string): string {
  const clean = message.trim().replace(/\s+/g, " ");
  if (clean.length <= 32) return clean || "New chat";
  return clean.slice(0, 30).trimEnd() + "…";
}
