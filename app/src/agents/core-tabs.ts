import type { AgentConfig, AgentTab } from "../lib/types";

export const CORE_TABS: AgentTab[] = [
  { id: "chat", label: "Chat", builtIn: "chat" },
  { id: "terminal", label: "Terminal", builtIn: "terminal" },
  { id: "queue", label: "Queue", builtIn: "queue", badge: "activity" },
  { id: "job-description", label: "Playbook", builtIn: "job-description" },
  { id: "abilities", label: "Abilities", builtIn: "abilities" },
];

/**
 * Returns the resolved tab list for an agent.
 * - `extensionTabs` present → prepend CORE_TABS then extension tabs
 * - `tabs` present (legacy / agent-creator) → return as-is
 * - neither → return CORE_TABS as a safe fallback
 */
export function resolveAgentTabs(config: AgentConfig): AgentTab[] {
  if (config.extensionTabs !== undefined) {
    return [...CORE_TABS, ...config.extensionTabs];
  }
  if (config.tabs !== undefined) {
    return config.tabs;
  }
  return CORE_TABS;
}
