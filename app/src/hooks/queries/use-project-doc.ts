import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProjectDocSlug } from "@squad/engine-client";
import { tauriProjects } from "../../lib/tauri";

/**
 * Project-scoped doc reader (M1) — distinct from `useProjectDocs` which
 * handles the workspace-level docs/index.json store. This hook backs
 * the per-project CLAUDE.md / Rules / Architecture editors and feeds
 * the same files the engine's prompt assembly injects.
 */
const KEY = (workspaceId: string, projectId: string, doc: ProjectDocSlug) =>
  ["project-doc", workspaceId, projectId, doc] as const;

export function useProjectScopedDoc(
  workspaceId: string | undefined,
  projectId: string | undefined,
  doc: ProjectDocSlug,
) {
  return useQuery({
    queryKey: KEY(workspaceId ?? "", projectId ?? "", doc),
    queryFn: () => tauriProjects.readDoc(workspaceId!, projectId!, doc),
    enabled: !!workspaceId && !!projectId,
  });
}

export function useSaveProjectScopedDoc(
  workspaceId: string | undefined,
  projectId: string | undefined,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { doc: ProjectDocSlug; content: string }) => {
      await tauriProjects.writeDoc(workspaceId!, projectId!, input.doc, input.content);
    },
    onSuccess: (_data, input) => {
      if (workspaceId && projectId) {
        qc.invalidateQueries({ queryKey: KEY(workspaceId, projectId, input.doc) });
      }
    },
  });
}
