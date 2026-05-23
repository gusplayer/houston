import type { AgentConfig } from "../../lib/types";

export const devAgent: AgentConfig = {
  id: "dev-agent",
  name: "Dev agent",
  description: "A senior engineering companion. Bound to a repo, it understands your stack, tracks work, and ships code.",
  icon: "Code2",
  category: "productivity",
  author: "Squad",
  tags: ["dev", "engineering", "code", "git", "repo"],
  roleLabel: "Dev",
  extensionTabs: [
    { id: "repo", label: "Repo", builtIn: "repo" },
    { id: "sprints", label: "Sprints", builtIn: "sprints" },
    { id: "docs", label: "Docs", builtIn: "docs" },
    { id: "skills", label: "Skills", builtIn: "skills" },
    { id: "mcp", label: "MCP", builtIn: "mcp" },
    { id: "integrations", label: "Integrations", builtIn: "integrations" },
  ],
  defaultTab: "activity",
  claudeMd: "# Dev agent\n\nYou are a senior engineering companion. Read the current repo structure before suggesting changes. Prefer concrete file paths, exact commands, and code over prose explanations.",
};
