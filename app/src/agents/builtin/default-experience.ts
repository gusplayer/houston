import type { AgentConfig } from "../../lib/types";

export const blankAgent: AgentConfig = {
  id: "blank",
  name: "Start from scratch",
  description: "A blank agent with no pre-configured actions, instructions, or learnings — build it your way",
  icon: "Plus",
  category: "productivity",
  author: "Squad",
  tags: ["blank", "custom", "starter"],
  extensionTabs: [
    { id: "repo", label: "Repo", builtIn: "repo" },
    { id: "integrations", label: "Integrations", builtIn: "integrations" },
  ],
  defaultTab: "activity",
  claudeMd: "",
};
