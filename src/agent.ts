// The CodeSage agent reasoning engine.
//
// Supports both a local deterministic skill & agentic tool execution engine
// and a remote OpenAI-compatible LLM endpoint with Tool Calling (Function Calling) capability.

import type { AgentSettings, AgentSkill, ChatMessage, ToolCall } from "./types";
import { AGENT_TOOLS, OPENAI_TOOLS_SCHEMA } from "./tools";

export interface AgentResult {
  content: string;
  reasoning: string[];
  toolsUsed?: ToolCall[];
}

export const AGENT_SKILLS: AgentSkill[] = [
  { id: "eval_js", label: "JS Sandbox", description: "Execute JavaScript code safely", icon: "⚡" },
  { id: "web_fetch", label: "Web Fetch", description: "Retrieve public HTTP/API content", icon: "🌐" },
  { id: "memory", label: "Agent Memory", description: "Store & recall persistent context", icon: "🧠" },
  { id: "math", label: "Math", description: "Arithmetic & expressions", icon: "➗" },
  { id: "convert", label: "Convert", description: "Length, weight, temperature", icon: "🔁" },
  { id: "time", label: "Time", description: "Date, time & days until", icon: "🕒" },
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
    agent: "A software component that perceives its environment and takes autonomous actions to achieve goals.",
    api: "Application Programming Interface — a set of rules allowing software systems to communicate.",
    react: "A JavaScript library for building component-based user interfaces.",
    algorithm: "A finite sequence of well-defined instructions to solve a problem.",
    variable: "A named storage location in a program holding a mutable or immutable value.",
    recursion: "A technique where a function calls itself to solve smaller sub-problems.",
  };
  if (word in GLOSSARY) return `${capitalize(word)}: ${GLOSSARY[word]}`;
  return null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Local Agentic Tool Router (Autonomous decision loop for local execution)
async function tryLocalToolExecution(input: string): Promise<{ result: AgentResult; handled: boolean }> {
  const lower = input.toLowerCase();
  const reasoning: string[] = ["[Local Agentic Loop] Analyzing message for tool execution intents."];
  const toolsUsed: ToolCall[] = [];

  // Intent 1: Direct JS execution / run request
  if (lower.startsWith("run js:") || lower.startsWith("eval:") || lower.startsWith("exec:")) {
    const code = input.replace(/^(run js:|eval:|exec:)/i, "").trim();
    reasoning.push(`Identified intent: Tool 'evaluate_javascript' on code block.`);
    const callId = "tool_" + Math.random().toString(36).slice(2, 8);
    const execResult = await AGENT_TOOLS.evaluate_javascript.execute({ code });
    toolsUsed.push({
      id: callId,
      toolName: "evaluate_javascript",
      args: { code },
      result: execResult,
      status: "success",
    });
    reasoning.push(`Executed 'evaluate_javascript' tool successfully.`);
    return {
      handled: true,
      result: {
        content: `⚡ **Executed JavaScript Tool:**\n\`\`\`\n${execResult}\n\`\`\``,
        reasoning,
        toolsUsed,
      },
    };
  }

  // Intent 2: Web fetch intent
  const fetchMatch = input.match(/\b(?:fetch|get|read)\b\s+(https?:\/\/[^\s]+)/i);
  if (fetchMatch) {
    const url = fetchMatch[1];
    reasoning.push(`Identified intent: Tool 'get_web_page' for URL: ${url}`);
    const callId = "tool_" + Math.random().toString(36).slice(2, 8);
    const fetchResult = await AGENT_TOOLS.get_web_page.execute({ url });
    toolsUsed.push({
      id: callId,
      toolName: "get_web_page",
      args: { url },
      result: fetchResult,
      status: "success",
    });
    reasoning.push(`Executed 'get_web_page' tool.`);
    return {
      handled: true,
      result: {
        content: `🌐 **Fetched Content from ${url}:**\n\`\`\`\n${fetchResult}\n\`\`\``,
        reasoning,
        toolsUsed,
      },
    };
  }

  // Intent 3: Memory management intent
  const memSetMatch = input.match(/\bremember\s+([a-z0-9_-]+)\s+as\s+(.+)/i);
  if (memSetMatch) {
    const key = memSetMatch[1];
    const value = memSetMatch[2];
    reasoning.push(`Identified intent: Tool 'manage_memory' (action: set, key: ${key})`);
    const callId = "tool_" + Math.random().toString(36).slice(2, 8);
    const memResult = await AGENT_TOOLS.manage_memory.execute({ action: "set", key, value });
    toolsUsed.push({
      id: callId,
      toolName: "manage_memory",
      args: { action: "set", key, value },
      result: memResult,
      status: "success",
    });
    return {
      handled: true,
      result: {
        content: `🧠 **Agent Memory Updated:**\nSaved \`${key}\` = "${value}".`,
        reasoning,
        toolsUsed,
      },
    };
  }

  const memGetMatch = input.match(/\brecall\s+([a-z0-9_-]+)/i);
  if (memGetMatch) {
    const key = memGetMatch[1];
    reasoning.push(`Identified intent: Tool 'manage_memory' (action: get, key: ${key})`);
    const callId = "tool_" + Math.random().toString(36).slice(2, 8);
    const memResult = await AGENT_TOOLS.manage_memory.execute({ action: "get", key });
    toolsUsed.push({
      id: callId,
      toolName: "manage_memory",
      args: { action: "get", key },
      result: memResult,
      status: "success",
    });
    return {
      handled: true,
      result: {
        content: `🧠 **Agent Memory Retrieval:**\n${memResult}`,
        reasoning,
        toolsUsed,
      },
    };
  }

  return { handled: false, result: { content: "", reasoning: [] } };
}

export async function runAgentLocal(input: string, priorUserMessages: string[] = []): Promise<AgentResult> {
  const trimmed = input.trim();

  // Try Agentic Tool Intent routing first
  const toolCheck = await tryLocalToolExecution(trimmed);
  if (toolCheck.handled) return toolCheck.result;

  const reasoning: string[] = [`[Local Engine] Evaluated non-tool skills.`];

  const math = tryArithmetic(trimmed);
  if (math !== null) {
    reasoning.push("Matched math skill — evaluated arithmetic.");
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

  reasoning.push("Returning default agentic guidance.");
  return {
    content: `I'm CodeSage agent! You can run JavaScript, fetch URLs, or store memory using my agentic tools:\n\n` +
      `- **JS Execution:** \`run js: [1,2,3].map(x => x * 2)\`\n` +
      `- **Web Fetch:** \`fetch https://api.github.com\`\n` +
      `- **Memory:** \`remember user_role as Developer\` or \`recall user_role\`\n` +
      `- **Math & Conversions:** \`18 * (7 + 4)\` or \`5 km to miles\``,
    reasoning,
  };
}

async function callRemoteLLM(
  messages: ChatMessage[],
  settings: AgentSettings
): Promise<AgentResult> {
  const reasoning: string[] = [
    `[Remote LLM] Connecting to ${settings.baseUrl} with Tool Schema enabled.`,
  ];
  const toolsUsed: ToolCall[] = [];

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.apiKey) headers["Authorization"] = `Bearer ${settings.apiKey}`;

  const formattedMessages: Array<Record<string, unknown>> = [
    {
      role: "system",
      content:
        "You are CodeSage, an autonomous AI agent equipped with function-calling tools. " +
        "You can evaluate JavaScript, fetch URLs, and manage browser memory to fulfill requests.",
    },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const endpoint = settings.baseUrl.endsWith("/chat/completions")
    ? settings.baseUrl
    : `${settings.baseUrl.replace(/\/$/, "")}/chat/completions`;

  // Step 1: Request with tools enabled
  const initialRes = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: settings.model || "gpt-4o-mini",
      messages: formattedMessages,
      tools: OPENAI_TOOLS_SCHEMA,
      tool_choice: "auto",
    }),
  });

  if (!initialRes.ok) {
    const text = await initialRes.text().catch(() => "");
    throw new Error(`API Request failed (${initialRes.status}): ${text.slice(0, 150)}`);
  }

  const initialData = await initialRes.json();
  const choice = initialData?.choices?.[0];
  const responseMessage = choice?.message;

  // Step 2: Handle Tool Calls if returned by the LLM
  if (responseMessage?.tool_calls && Array.isArray(responseMessage.tool_calls)) {
    reasoning.push(`[Remote LLM] Model decided to execute ${responseMessage.tool_calls.length} tool call(s).`);
    formattedMessages.push(responseMessage);

    for (const toolCall of responseMessage.tool_calls) {
      const toolName = toolCall.function.name;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(toolCall.function.arguments || "{}");
      } catch {
        args = {};
      }

      reasoning.push(`Executing Tool: '${toolName}' with arguments: ${JSON.stringify(args)}`);

      let resultText = "";
      if (AGENT_TOOLS[toolName]) {
        resultText = await AGENT_TOOLS[toolName].execute(args);
      } else {
        resultText = `Error: Tool '${toolName}' not found in registry.`;
      }

      toolsUsed.push({
        id: toolCall.id || Math.random().toString(),
        toolName,
        args,
        result: resultText,
        status: "success",
      });

      formattedMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: toolName,
        content: resultText,
      });
    }

    // Step 3: Send tool execution results back to LLM for final answer
    reasoning.push(`[Remote LLM] Sending tool outputs back to LLM for synthesis.`);
    const finalRes = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: settings.model || "gpt-4o-mini",
        messages: formattedMessages,
      }),
    });

    if (finalRes.ok) {
      const finalData = await finalRes.json();
      const finalContent = finalData?.choices?.[0]?.message?.content;
      if (finalContent) {
        return { content: finalContent, reasoning, toolsUsed };
      }
    }
  }

  const content = responseMessage?.content;
  if (!content) throw new Error("Received empty response from LLM API.");

  return { content, reasoning, toolsUsed };
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
      const fallback = await runAgentLocal(input, priorUserMessages);
      return {
        content: `⚠️ **Remote Agentic Call Failed:** ${errorMsg}\n\n*Fell back to local agentic engine:*\n\n${fallback.content}`,
        reasoning: [
          `[Remote LLM Error] ${errorMsg}`,
          "Fell back to local agentic engine.",
          ...fallback.reasoning,
        ],
        toolsUsed: fallback.toolsUsed,
      };
    }
  }

  return await runAgentLocal(input, priorUserMessages);
}

export function titleFromMessage(message: string): string {
  const clean = message.trim().replace(/\s+/g, " ");
  if (clean.length <= 32) return clean || "New chat";
  return clean.slice(0, 30).trimEnd() + "…";
}
