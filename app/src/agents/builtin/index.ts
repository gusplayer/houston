import { agentCreator } from "./agent-creator";
import { blankAgent } from "./default-experience";
import { personalAssistantAgent } from "./personal-assistant";
import { devAgent } from "./dev-agent";
import { ctoAgent } from "./cto-agent";
import { mobileLeadAgent } from "./mobile-lead-agent";
import { backendLeadAgent } from "./backend-lead-agent";
import { frontendLeadAgent } from "./frontend-lead-agent";
import { designerAgent } from "./designer-agent";
import { qaAgent } from "./qa-agent";
import { devopsAgent } from "./devops-agent";
import type { AgentConfig } from "../../lib/types";

// Team library — pre-built role agents with names + personalities. The
// CTO is first so a new workspace naturally starts with the lead, then
// the user "hires" specialists from the catalog.
export const builtinConfigs: AgentConfig[] = [
  ctoAgent,
  mobileLeadAgent,
  backendLeadAgent,
  frontendLeadAgent,
  designerAgent,
  qaAgent,
  devopsAgent,
  devAgent,
  personalAssistantAgent,
  blankAgent,
  agentCreator,
];
