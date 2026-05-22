/** `.squad/config/config.json` — per-agent provider/model config. */

import schema from "@squad/agent-schemas/config.schema.json";
import { readAgentJson, writeAgentJson } from "./agent-file";

export interface Config {
  name?: string;
  provider?: "anthropic" | "openai";
  model?: string;
  effort?: "low" | "medium" | "high";
  /**
   * Workspace project IDs this agent is bound to. Empty or unset means
   * the agent sees all workspace projects (CTO mode). Used by the Repo
   * tab to scope which projects this agent can switch between.
   */
  projectIds?: string[];
  [extra: string]: unknown;
}

const NAME = "config";
const s = schema as unknown as Parameters<typeof readAgentJson>[2];

export async function read(agentPath: string): Promise<Config> {
  return readAgentJson<Config>(agentPath, NAME, s, {});
}

export async function write(agentPath: string, config: Config): Promise<void> {
  await writeAgentJson(agentPath, NAME, s, config);
}
