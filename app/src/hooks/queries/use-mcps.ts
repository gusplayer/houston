import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriMcps } from "../../lib/tauri";
import type { McpConfig } from "@squad/engine-client";

export function useMcpConfig(agentPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.mcpConfig(agentPath ?? ""),
    queryFn: () => tauriMcps.read(agentPath!),
    enabled: !!agentPath,
  });
}

export function useSaveMcpConfig(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: McpConfig) => tauriMcps.write(agentPath!, config),
    onSuccess: () => {
      if (agentPath) qc.invalidateQueries({ queryKey: queryKeys.mcpConfig(agentPath) });
    },
  });
}
