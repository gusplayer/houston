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
