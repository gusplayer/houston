/**
 * Centralized query key factory for TanStack Query.
 *
 * Every agent-scoped query is keyed by [resource, agentPath].
 * This makes invalidation trivial: on an "ActivityChanged" event for path X,
 * invalidate queryKeys.activity(X).
 */
export const queryKeys = {
  // Agent-scoped (reactive via file watcher + Tauri events)
  activity: (agentPath: string) => ["activity", agentPath] as const,
  skills: (agentPath: string) => ["skills", agentPath] as const,
  skillDetail: (agentPath: string, name: string) =>
    ["skill-detail", agentPath, name] as const,
  files: (agentPath: string) => ["files", agentPath] as const,
  instructions: (agentPath: string) =>
    ["instructions", agentPath] as const,
  rules: (agentPath: string) =>
    ["rules", agentPath] as const,
  config: (agentPath: string) => ["config", agentPath] as const,
  routines: (agentPath: string) => ["routines", agentPath] as const,
  learnings: (agentPath: string) => ["learnings", agentPath] as const,
  routineRuns: (agentPath: string, routineId?: string) =>
    routineId
      ? (["routine-runs", agentPath, routineId] as const)
      : (["routine-runs", agentPath] as const),
  conversations: (agentPath: string) =>
    ["conversations", agentPath] as const,
  allConversations: (agentPaths: string[]) =>
    ["all-conversations", ...agentPaths] as const,
  chatHistory: (agentPath: string, sessionKey: string) =>
    ["chat-history", agentPath, sessionKey] as const,

  // App-scoped (less reactive, loaded on init)
  connections: () => ["connections"] as const,
  composioApps: () => ["composio-apps"] as const,
  connectedToolkits: () => ["connected-toolkits"] as const,

  // Agent-scoped dev workflow data
  sprints: (agentPath: string) => ["sprints", agentPath] as const,
  stories: (agentPath: string) => ["stories", agentPath] as const,

  // Agent-scoped MCP config
  mcpConfig: (agentPath: string) => ["mcp-config", agentPath] as const,

  // Workspace-scoped phase ownership (which agent owns each SDLC phase)
  phaseOwnership: (workspacePath: string) => ["phase-ownership", workspacePath] as const,

  // Workspace-scoped projects
  projects: (workspaceId: string) => ["projects", workspaceId] as const,
  // Project-scoped git queries
  gitStatus: (workspaceId: string, projectId: string) => ["git-status", workspaceId, projectId] as const,
  gitLog: (workspaceId: string, projectId: string) => ["git-log", workspaceId, projectId] as const,
  gitBranches: (workspaceId: string, projectId: string) => ["git-branches", workspaceId, projectId] as const,
  gitDiff: (workspaceId: string, projectId: string, from?: string, to?: string) =>
    ["git-diff", workspaceId, projectId, from ?? "", to ?? ""] as const,
};
