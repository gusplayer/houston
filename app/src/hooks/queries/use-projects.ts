import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriProjects, tauriGit } from "../../lib/tauri";
import type { CreateProject, UpdateProject } from "@squad/engine-client";

export function useProjects(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.projects(workspaceId ?? ""),
    queryFn: () => tauriProjects.list(workspaceId!),
    enabled: !!workspaceId,
  });
}

export function useCreateProject(workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateProject) => tauriProjects.create(workspaceId!, req),
    onSuccess: () => {
      if (workspaceId) qc.invalidateQueries({ queryKey: queryKeys.projects(workspaceId) });
    },
  });
}

export function useUpdateProject(workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, req }: { projectId: string; req: UpdateProject }) =>
      tauriProjects.update(workspaceId!, projectId, req),
    onSuccess: () => {
      if (workspaceId) qc.invalidateQueries({ queryKey: queryKeys.projects(workspaceId) });
    },
  });
}

export function useDeleteProject(workspaceId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => tauriProjects.delete(workspaceId!, projectId),
    onSuccess: () => {
      if (workspaceId) qc.invalidateQueries({ queryKey: queryKeys.projects(workspaceId) });
    },
  });
}

export function useGitStatus(
  workspaceId: string | undefined,
  projectId: string | undefined,
  options?: { refetchInterval?: number },
) {
  return useQuery({
    queryKey: queryKeys.gitStatus(workspaceId ?? "", projectId ?? ""),
    queryFn: () => tauriGit.status(workspaceId!, projectId!),
    enabled: !!workspaceId && !!projectId,
    refetchInterval: options?.refetchInterval,
  });
}

export function useGitLog(workspaceId: string | undefined, projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.gitLog(workspaceId ?? "", projectId ?? ""),
    queryFn: () => tauriGit.log(workspaceId!, projectId!, 30),
    enabled: !!workspaceId && !!projectId,
  });
}

export function useGitBranches(workspaceId: string | undefined, projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.gitBranches(workspaceId ?? "", projectId ?? ""),
    queryFn: () => tauriGit.branches(workspaceId!, projectId!),
    enabled: !!workspaceId && !!projectId,
  });
}

export function useGitDiff(
  workspaceId: string | undefined,
  projectId: string | undefined,
  from?: string,
  to?: string,
) {
  return useQuery({
    queryKey: queryKeys.gitDiff(workspaceId ?? "", projectId ?? "", from, to),
    queryFn: () => tauriGit.diff(workspaceId!, projectId!, from, to),
    enabled: !!workspaceId && !!projectId,
  });
}
