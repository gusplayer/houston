import { agentCreator } from "./agent-creator";
import { blankAgent } from "./default-experience";
import { personalAssistantAgent } from "./personal-assistant";
import { devAgent } from "./dev-agent";
import { ctoAgent } from "./cto-agent";
import { pmAgent } from "./pm-agent";
import { codeReviewerAgent } from "./code-reviewer-agent";
import { architectAgent } from "./architect-agent";
import { mobileLeadAgent } from "./mobile-lead-agent";
import { backendLeadAgent } from "./backend-lead-agent";
import { frontendLeadAgent } from "./frontend-lead-agent";
import { designerAgent } from "./designer-agent";
import { qaAgent } from "./qa-agent";
import { devopsAgent } from "./devops-agent";
import type { AgentConfig } from "../../lib/types";

// Team library — pre-built role agents with names + personalities. The five
// protected default members (Sam CTO, Steve PM, Jane Code Reviewer, Jeff QA,
// Adam Architect) ship first; specialists come after. The catalog ordering
// also drives the recommender's display order in RecruitTeamDialog.
export const builtinConfigs: AgentConfig[] = [
  ctoAgent,
  pmAgent,
  codeReviewerAgent,
  qaAgent,
  architectAgent,
  mobileLeadAgent,
  backendLeadAgent,
  frontendLeadAgent,
  designerAgent,
  devopsAgent,
  devAgent,
  personalAssistantAgent,
  blankAgent,
  agentCreator,
];

/** Config IDs of the protected default members auto-hired on workspace create
 * and refused by the engine on DELETE. Order is the order they're hired in. */
export const PROTECTED_CONFIG_IDS = [
  "cto-agent",
  "pm-agent",
  "code-reviewer-agent",
  "qa-agent",
  "architect-agent",
] as const;
export type ProtectedConfigId = (typeof PROTECTED_CONFIG_IDS)[number];

/** Canonical role-tier ordering used by sidebar lists, the agent picker, and
 * any other UI that surfaces the team. CTO first (workspace lead), then PM,
 * Architect, Code Reviewer, QA, specialists, dev, assistant, then anything
 * else falls to the bottom in insertion order. */
const ROLE_TIER_ORDER: readonly string[] = [
  "cto-agent",
  "architect-agent",
  "pm-agent",
  "code-reviewer-agent",
  "qa-agent",
  "mobile-lead-agent",
  "backend-lead-agent",
  "frontend-lead-agent",
  "designer-agent",
  "devops-agent",
  "dev-agent",
  "personal-assistant",
  "blank",
  "agent-creator",
];

/** Tier index for `configId`. Unknown configs sort after all known tiers. */
export function roleTierIndex(configId: string | undefined): number {
  if (!configId) return Number.MAX_SAFE_INTEGER;
  const idx = ROLE_TIER_ORDER.indexOf(configId);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

/** Stable sort that puts agents in canonical role-tier order, preserving the
 * caller's original order for ties. The CTO ends up first, then Architect,
 * PM, Code Reviewer, QA, and so on. */
export function sortAgentsByRoleTier<T extends { configId?: string }>(
  agents: readonly T[],
): T[] {
  return [...agents].sort((a, b) => roleTierIndex(a.configId) - roleTierIndex(b.configId));
}
