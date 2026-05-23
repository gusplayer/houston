/** A workspace (top-level container, formerly "Space") */
/** Result of importing a workspace template from GitHub. */
export interface ImportedWorkspace {
  workspaceId: string;
  workspaceName: string;
  agentIds: string[];
}

export interface Workspace {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  /** AI provider for this workspace ("anthropic" or "openai"). */
  provider?: string;
  /** Default model for this workspace (e.g. "sonnet", "gpt-5.5"). */
  model?: string;
  /** Absolute filesystem path of the workspace folder, populated by the
   * engine. Used to scope workspace-level data (sprints, stories,
   * projects) to the right directory. */
  path?: string;
}

/** Tab definition in an agent config */
export interface AgentTab {
  /** Tab identifier. Built-in: "chat", "board", "files", "job-description", "integrations", "connections", "routines", "events". Custom: any string. */
  id: string;
  /** Display label in the tab bar */
  label: string;
  /** If this maps to a built-in tab component. Must be one of the built-in IDs. */
  builtIn?: string;
  /** Export name from bundle.js for custom React components */
  customComponent?: string;
  /** Badge source: "activity" shows count of active items */
  badge?: "activity" | "none";
  /** If true, the tab is non-clickable (shown muted in the tab bar). */
  disabled?: boolean;
  /** Optional text chip shown next to the label (e.g. "Soon"). */
  chip?: string;
}

/** Agent category for Squad Store filtering.
 *
 * TODO: narrow to a union once the engine-client `StoreListing` type also
 * narrows (`@squad/engine-client/src/types.ts` currently types
 * `category: string`). Today's Store sidebar exposes only four buckets —
 * `"business" | "marketing" | "operations" | "people"` — but built-in
 * agent configs use `"productivity"` and the engine-client cross-package
 * type uses `string`, so narrowing in this app-side type causes a
 * boundary type mismatch in `tauri.ts`. */
export type AgentCategory = string;

/** An agent mode defines a prompt profile (e.g. "execution" or "planning"). */
export interface AgentMode {
  id: string;              // e.g. "execution", "planning"
  name: string;            // Display name, e.g. "Coder", "Planner"
  promptFile: string;      // Mode name → reads .squad/prompts/modes/{promptFile}.md
  createLabel: string;     // Button label, e.g. "New Mission"
}

/** The agent config (squad.json schema) */
export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  version?: string;
  icon?: string;           // Lucide icon name (fallback if no image)
  image?: string;          // Image URL for store card
  color?: string;          // Brand color override
  category?: AgentCategory;
  author?: string;         // e.g. "Squad" for official, user name for community
  tags?: string[];         // Searchable tags
  integrations?: string[]; // Composio toolkit slugs used by bundled agents
  tabs: AgentTab[];
  defaultTab?: string;     // Tab ID to show by default, defaults to first tab
  claudeMd?: string;       // CLAUDE.md content template
  systemPrompt?: string;   // System prompt for the assistant
  agentSeeds?: Record<string, string>;  // Files to seed in new agents
  features?: string[];     // Rust feature flags needed
  agents?: AgentMode[];    // Multiple prompt profiles for multi-agent setups
  roleLabel?: string;      // Short role label shown in sidebar, e.g. "CTO", "Frontend Lead"
}

/** A resolved agent definition (config + where it came from) */
export interface AgentDefinition {
  config: AgentConfig;
  source: "builtin" | "installed";
  path?: string;           // For installed: ~/.squad/agents/{id}/
  bundleUrl?: string;      // For custom React: URL to bundle.js
}

/** An agent instance (formerly "Workspace") */
export interface Agent {
  id: string;
  name: string;
  folderPath: string;      // ~/.squad/workspaces/{WorkspaceName}/{AgentName}/
  configId: string;      // Points to an AgentConfig
  color?: string;        // User-chosen color for avatar
  createdAt: string;
  lastOpenedAt?: string;
}

/** Props injected into every tab component */
export interface TabProps {
  agent: Agent;
  agentDef: AgentDefinition;
}

/** Props injected into custom (bundle.js) tab components */
export interface CustomTabProps extends TabProps {
  readFile: (name: string) => Promise<string>;
  writeFile: (name: string, content: string) => Promise<void>;
  listFiles: () => Promise<Array<{ path: string; name: string; size: number }>>;
  sendMessage: (text: string) => void;
}

/** Skill summary returned by list_skills */
export interface SkillSummary {
  name: string;
  description: string;
  version: number;
  tags: string[];
  created: string | null;
  last_used: string | null;
  /** Optional user-facing category (e.g. "Email"). Groups skills in the New Mission picker. */
  category: string | null;
  /** Surface on the Featured tab of the New Mission picker. */
  featured: boolean;
  /** Composio toolkit slugs this skill uses (e.g. ["gmail","slack"]). */
  integrations: string[];
  /** Image URL or Microsoft Fluent 3D Emoji slug (e.g. "rocket"). */
  image: string | null;
  /** Legacy structured inputs. Parsed for compatibility, ignored by composer UX. */
  inputs: SkillInputDef[];
  /** Legacy prompt template. Parsed for compatibility, ignored by sends. */
  prompt_template: string | null;
}

export interface SkillInputDef {
  name: string;
  label: string;
  placeholder?: string;
  type: "text" | "textarea" | "select";
  required: boolean;
  default?: string;
  /** Options for `type: select`. Empty for text/textarea. */
  options?: string[];
}

/** Skill detail returned by load_skill */
export interface SkillDetail {
  name: string;
  description: string;
  version: number;
  content: string;
}

/** Community skill search result */
export interface CommunitySkillResult {
  id: string;
  skillId: string;
  name: string;
  installs: number;
  source: string;
}

/** A skill discovered in a GitHub repo */
export interface RepoSkill {
  id: string;
  name: string;
  description: string;
  path: string;
}

/** File entry returned by list_project_files */
export interface FileEntry {
  path: string;
  name: string;
  extension: string;
  size: number;
}

/** A listing from the Squad Store registry */
export interface StoreListing {
  id: string;
  name: string;
  description: string;
  category: string;
  author: string;
  tags: string[];
  icon_url: string;
  integrations?: string[];
  repo: string;
  installs: number;
  registered_at: string;
  version?: string;
  content_hash?: string;
  bundled?: boolean;
  /** Origin of the listing. Real Squad-published agents come from the
   * engine catalog (no source set or "squad"). Community entries come
   * from third-party repos. "mock" is used by design previews. */
  source?: "squad" | "community" | "mock";
  /** True if the publisher has been verified by Squad. */
  verified?: boolean;
  /** Average user rating, 0-5 with one decimal. */
  rating?: number;
  /** Total number of user reviews. */
  reviews_count?: number;
  /** GitHub stars for the source repo (community only). */
  stars?: number;
  /** Publisher metadata for the Store detail view. */
  publisher?: {
    name: string;
    handle?: string;
    github_url?: string;
    avatar_url?: string;
    verified?: boolean;
  };
  /** Pricing for the agent. Free unless set. */
  pricing?:
    | { kind: "free" }
    | {
        kind: "paid";
        price_cents: number;
        currency: string;
        model: "one_time" | "subscription";
      };
  /** Optional link to a long-form README to render in the detail view. */
  readme_url?: string;
  /** Optional gallery image URLs. */
  screenshots?: string[];
}
