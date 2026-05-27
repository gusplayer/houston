/**
 * Auto-hire the five protected default members (Sam CTO, Steve PM, Jane Code
 * Reviewer, Jeff QA, Adam Architect) into a freshly-created workspace.
 *
 * Hires are sequential — the engine's workspace agent registry assumes
 * ordered writes, parallel creates race (see team-library KB). Each hire
 * is independent so a single failure surfaces a toast but doesn't abort the
 * remaining hires; the user gets as many of the team as we could land.
 */
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useAgentStore } from "../../stores/agents";
import { PROTECTED_CONFIG_IDS } from "../../agents/builtin";

/** Color id (from `AGENT_COLORS`) assigned to each protected default. Chosen
 * so the sidebar reads at a glance — lead navy, PM purple, reviewer crimson,
 * QA forest, architect golden. */
const PROTECTED_COLORS: Record<(typeof PROTECTED_CONFIG_IDS)[number], string> = {
  "cto-agent": "navy",
  "pm-agent": "purple",
  "code-reviewer-agent": "crimson",
  "qa-agent": "forest",
  "architect-agent": "golden",
};

export interface ProtectedHireResult {
  hired: string[];
  /** Config IDs that failed to hire, paired with the error message. */
  failed: Array<{ configId: string; message: string }>;
}

export async function hireProtectedRoster(
  workspaceId: string,
): Promise<ProtectedHireResult> {
  const agentDefs = useAgentCatalogStore.getState().agents;
  const create = useAgentStore.getState().create;

  const hired: string[] = [];
  const failed: ProtectedHireResult["failed"] = [];

  for (const configId of PROTECTED_CONFIG_IDS) {
    const def = agentDefs.find((d) => d.config.id === configId);
    if (!def) {
      failed.push({
        configId,
        message: `Built-in config "${configId}" not found in catalog`,
      });
      continue;
    }
    const name = def.config.name;
    const color = PROTECTED_COLORS[configId];
    try {
      await create(
        workspaceId,
        name,
        configId,
        color,
        def.config.claudeMd,
        def.path,
        def.config.agentSeeds,
        undefined, // existingPath — fresh agent folder
        true, // protected
      );
      hired.push(configId);
    } catch (err) {
      failed.push({
        configId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { hired, failed };
}
