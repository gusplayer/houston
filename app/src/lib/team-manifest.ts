/**
 * H.1 — repo-tracked team manifest.
 *
 * A team manifest lives at `<repo>/.squad/team.json` and lists the
 * role agents that should work on this repo. It's committed alongside
 * the code, so cloning the repo on another machine is enough to know
 * which team to hire. The actual agent definitions (CLAUDE.md, skills,
 * conversations) stay in `~/.squad/`; the manifest is a thin index.
 *
 * Read/write is just JSON I/O — no engine route. We reuse
 * tauriAgent.readFile / writeFile against an arbitrary repo path
 * (the same trick F.2 uses for workspace-level files).
 */
import { tauriAgent } from "./tauri";
import type { Agent, AgentDefinition } from "./types";

export interface TeamMember {
  /** Built-in role agent id, e.g. "mobile-lead-agent". */
  role: string;
  /** Optional override of the role's built-in name. */
  name?: string;
  /** Optional override of the avatar color. */
  color?: string;
}

export interface TeamManifest {
  version: 1;
  agents: TeamMember[];
  note?: string;
}

const MANIFEST_REL = ".squad/team/team.json";

export async function readTeamManifest(
  repoPath: string,
): Promise<TeamManifest | null> {
  try {
    const raw = await tauriAgent.readFile(repoPath, MANIFEST_REL);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TeamManifest>;
    if (parsed.version !== 1 || !Array.isArray(parsed.agents)) return null;
    return parsed as TeamManifest;
  } catch {
    return null;
  }
}

export async function writeTeamManifest(
  repoPath: string,
  manifest: TeamManifest,
): Promise<void> {
  await tauriAgent.writeFile(
    repoPath,
    MANIFEST_REL,
    JSON.stringify(manifest, null, 2) + "\n",
  );
}

/**
 * Build a manifest from the current workspace agents. Only includes
 * agents whose configId maps to a built-in role (Maya, Diego, …) —
 * blank / personal-assistant / installed community agents are skipped
 * since they don't represent a portable "team role".
 */
export function buildManifestFromAgents(
  agents: Agent[],
  agentDefs: AgentDefinition[],
  /** Role IDs that count as part of the portable team library (G.1). */
  roleIds: readonly string[],
): TeamManifest {
  const members: TeamMember[] = [];
  for (const agent of agents) {
    const def = agentDefs.find((d) => d.config.id === agent.configId);
    if (!def) continue;
    if (!roleIds.includes(def.config.id)) continue;
    members.push({
      role: agent.configId,
      // Persist the name override only when it differs from the
      // role's default — keeps manifests tiny and re-imports clean.
      ...(agent.name && agent.name !== def.config.name
        ? { name: agent.name }
        : {}),
      ...(agent.color ? { color: agent.color } : {}),
    });
  }
  return { version: 1, agents: members };
}
