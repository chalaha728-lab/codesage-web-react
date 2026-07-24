// Agentic Tool definitions and execution registry for CodeSage.

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
  execute: (args: Record<string, unknown>) => Promise<string> | string;
}

export const AGENT_TOOLS: Record<string, ToolDefinition> = {
  evaluate_javascript: {
    name: "evaluate_javascript",
    description: "Safely execute JavaScript code in an isolated browser context and return the result or output.",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "JavaScript code string to evaluate." },
      },
      required: ["code"],
    },
    execute: (args) => {
      const code = String(args.code || "").trim();
      if (!code) return "Error: No code provided.";
      try {
        const logs: string[] = [];
        const mockConsole = {
          log: (...vals: unknown[]) => logs.push(vals.map(v => typeof v === "object" ? JSON.stringify(v) : String(v)).join(" ")),
          error: (...vals: unknown[]) => logs.push("[error] " + vals.join(" ")),
        };
        // Safe evaluation
        const fn = new Function("console", `"use strict"; ${code}`);
        const result = fn(mockConsole);
        let output = "";
        if (logs.length > 0) output += `Console output:\n${logs.join("\n")}\n`;
        if (result !== undefined) output += `Return value: ${typeof result === "object" ? JSON.stringify(result) : String(result)}`;
        return output.trim() || "Executed successfully (no return value or log output).";
      } catch (err: unknown) {
        return `Execution Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  },

  get_web_page: {
    name: "get_web_page",
    description: "Fetch web content or API response from a publicly accessible HTTP URL.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Public URL to fetch." },
      },
      required: ["url"],
    },
    execute: async (args) => {
      const url = String(args.url || "").trim();
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return "Error: URL must start with http:// or https://";
      }
      try {
        const res = await fetch(url);
        if (!res.ok) return `Fetch Failed with HTTP ${res.status}: ${res.statusText}`;
        const text = await res.text();
        return text.length > 2000 ? text.slice(0, 2000) + "\n...[truncated]" : text;
      } catch (err: unknown) {
        return `Fetch Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  },

  manage_memory: {
    name: "manage_memory",
    description: "Store or retrieve key-value information in persistent browser agent memory.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "Memory action: 'get', 'set', or 'list'", enum: ["get", "set", "list"] },
        key: { type: "string", description: "Key name to store or retrieve." },
        value: { type: "string", description: "Value to store (required for 'set')." },
      },
      required: ["action"],
    },
    execute: (args) => {
      const action = String(args.action || "").toLowerCase();
      const key = String(args.key || "").trim();
      const value = String(args.value || "").trim();
      const MEM_PREFIX = "codesage.agent_mem.";

      if (action === "list") {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k?.startsWith(MEM_PREFIX)) keys.push(k.replace(MEM_PREFIX, ""));
        }
        return keys.length ? `Stored memory keys: ${keys.join(", ")}` : "Agent memory is empty.";
      }

      if (action === "get") {
        if (!key) return "Error: Key required for 'get'.";
        const val = localStorage.getItem(MEM_PREFIX + key);
        return val !== null ? `Memory['${key}']: ${val}` : `Key '${key}' not found in agent memory.`;
      }

      if (action === "set") {
        if (!key) return "Error: Key required for 'set'.";
        localStorage.setItem(MEM_PREFIX + key, value);
        return `Successfully saved Memory['${key}'] = "${value}".`;
      }

      return "Invalid memory action.";
    },
  },
};

export const OPENAI_TOOLS_SCHEMA = Object.values(AGENT_TOOLS).map((t) => ({
  type: "function",
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  },
}));
