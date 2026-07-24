// Shared domain types for the CodeSage web AI agent.

export type Role = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  /** Optional intermediate "thinking" steps the agent took. */
  reasoning?: string[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

/** A capability the agent advertises in the UI. */
export interface AgentSkill {
  id: string;
  label: string;
  description: string;
  icon: string;
}
