import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriAgent } from "../../lib/tauri";
import type { StoryPhase } from "@squad/engine-client";

/**
 * Per-workspace mapping from SDLC phase to the agent who owns it.
 * Lives at `<workspace>/.squad/phase-ownership.json`. Used by the
 * Kanban auto-handoff: when a story finishes in phase X, it advances
 * to phase X+1 with assignedAgentId taken from this map.
 *
 * `null` means "no one owns this phase yet" — the story advances but
 * stays unassigned (user picks manually).
 */
export type PhaseOwnership = Partial<Record<StoryPhase, string | null>>;

async function readOwnership(workspacePath: string): Promise<PhaseOwnership> {
  const raw = await tauriAgent.readFile(
    workspacePath,
    ".squad/phase-ownership/phase-ownership.json",
  );
  if (!raw) return {};
  try {
    return JSON.parse(raw) as PhaseOwnership;
  } catch {
    return {};
  }
}

async function writeOwnership(
  workspacePath: string,
  data: PhaseOwnership,
): Promise<void> {
  await tauriAgent.writeFile(
    workspacePath,
    ".squad/phase-ownership/phase-ownership.json",
    JSON.stringify(data, null, 2),
  );
}

export function usePhaseOwnership(workspacePath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.phaseOwnership(workspacePath ?? ""),
    queryFn: () => readOwnership(workspacePath!),
    enabled: !!workspacePath,
  });
}

export function useSavePhaseOwnership(workspacePath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: PhaseOwnership) => {
      await writeOwnership(workspacePath!, data);
      return data;
    },
    onSuccess: () => {
      if (workspacePath) {
        qc.invalidateQueries({ queryKey: queryKeys.phaseOwnership(workspacePath) });
      }
    },
  });
}
