import { blankAgent } from "./default-experience";
import { personalAssistantAgent } from "./personal-assistant";
import { devAgent } from "./dev-agent";
import type { AgentConfig } from "../../lib/types";

export const builtinConfigs: AgentConfig[] = [
  devAgent,
  personalAssistantAgent,
  blankAgent,
];
