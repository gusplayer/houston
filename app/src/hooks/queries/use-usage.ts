import { useQuery } from "@tanstack/react-query";
import type { UsageRange } from "@squad/engine-client";
import { queryKeys } from "../../lib/query-keys";
import { tauriUsage } from "../../lib/tauri";

export function useWorkspaceUsage(workspaceId: string | undefined, range: UsageRange) {
  return useQuery({
    queryKey: queryKeys.workspaceUsage(workspaceId ?? "", range),
    queryFn: () => tauriUsage.workspace(workspaceId!, range),
    enabled: !!workspaceId,
  });
}

export function useAgentUsage(agentPath: string | undefined, range: UsageRange) {
  return useQuery({
    queryKey: queryKeys.agentUsage(agentPath ?? "", range),
    queryFn: () => tauriUsage.agent(agentPath!, range),
    enabled: !!agentPath,
  });
}

export function useSessionUsage(
  agentPath: string | undefined,
  sessionKey: string | undefined,
  provider: "anthropic" | "openai" = "anthropic",
) {
  return useQuery({
    queryKey: queryKeys.sessionUsage(agentPath ?? "", sessionKey ?? "", provider),
    queryFn: () => tauriUsage.session(agentPath!, sessionKey!, provider),
    enabled: !!agentPath && !!sessionKey,
  });
}

export function useSessionContextBreakdown(
  agentPath: string | undefined,
  sessionKey: string | undefined,
) {
  return useQuery({
    queryKey: queryKeys.contextBreakdown(agentPath ?? "", sessionKey ?? ""),
    queryFn: () => tauriUsage.contextBreakdown(agentPath!, sessionKey!),
    enabled: !!agentPath && !!sessionKey,
  });
}
