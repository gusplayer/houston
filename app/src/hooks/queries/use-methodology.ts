import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MethodologyConfig } from "@squad/engine-client";
import { queryKeys } from "../../lib/query-keys";
import { tauriMethodology } from "../../lib/tauri";

export function useMethodology(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.methodology(workspaceId ?? ""),
    queryFn: () => tauriMethodology.get(workspaceId!),
    enabled: !!workspaceId,
  });
}

export function useMethodologyStatus(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.methodologyStatus(workspaceId ?? ""),
    queryFn: () => tauriMethodology.status(workspaceId!),
    enabled: !!workspaceId,
  });
}

export function useUpdateMethodology(workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cfg: MethodologyConfig) =>
      tauriMethodology.put(workspaceId!, cfg),
    onSuccess: () => {
      if (workspaceId) {
        qc.invalidateQueries({ queryKey: queryKeys.methodology(workspaceId) });
      }
    },
  });
}

export function useSeedMethodologyForProject(workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      force,
    }: {
      projectId: string;
      force?: boolean;
    }) => tauriMethodology.seedProject(workspaceId!, projectId, force ?? false),
    onSuccess: () => {
      if (workspaceId) {
        qc.invalidateQueries({
          queryKey: queryKeys.methodologyStatus(workspaceId),
        });
      }
    },
  });
}
