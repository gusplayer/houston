import { useEffect, useState } from "react";
import { useProjects } from "./queries";
import { useAgentStore } from "../stores/agents";
import { useWorkspaceStore } from "../stores/workspaces";
import { readTeamManifest, type TeamMember } from "../lib/team-manifest";
import type { Project } from "@squad/engine-client";

export interface DetectedManifest {
  /** The project that had a non-empty manifest. */
  project: Project;
  /** All members listed in the manifest. */
  members: TeamMember[];
  /** Members whose `role` doesn't match an existing agent's `configId`
   * in this workspace — these are the "still to hire" candidates that
   * justify showing the banner. */
  missing: TeamMember[];
}

/**
 * H.3 — surface a persistent reminder when the workspace's bound
 * projects ship a team manifest the user hasn't fully hired yet.
 *
 * Returns the first project with a non-empty manifest that has missing
 * members. Returns null when:
 *   - no projects bound
 *   - no project has a manifest
 *   - every manifest member is already represented by a workspace agent
 */
export function useDetectedTeamManifest(): DetectedManifest | null {
  const workspace = useWorkspaceStore((s) => s.current);
  const { data: projects } = useProjects(workspace?.id);
  const agents = useAgentStore((s) => s.agents);

  const [detected, setDetected] = useState<DetectedManifest | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetected(null);

    if (!projects || projects.length === 0) return;

    (async () => {
      for (const project of projects) {
        const manifest = await readTeamManifest(project.repoPath);
        if (!manifest || manifest.agents.length === 0) continue;
        const missing = manifest.agents.filter(
          (m) => !agents.some((a) => a.configId === m.role),
        );
        if (missing.length === 0) continue; // already fully hired
        if (cancelled) return;
        setDetected({ project, members: manifest.agents, missing });
        return;
      }
    })();

    return () => {
      cancelled = true;
    };
    // Re-check when the project list or the agent roster changes — both
    // can flip the "missing" calculation.
  }, [projects, agents]);

  return detected;
}
