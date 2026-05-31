import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { LibraryKind } from "@squad/engine-client";
import { queryKeys } from "../../lib/query-keys";
import { tauriLibrary } from "../../lib/tauri";

/**
 * TanStack hooks over `/v1/library/*`. The library is global to the user
 * (`~/.squad/library/<kind>/<slug>/`), so query keys do not include an
 * agent path.
 */

export function useUserLibrary(kind: LibraryKind) {
  return useQuery({
    queryKey: queryKeys.userLibrary(kind),
    queryFn: () => tauriLibrary.list(kind),
  });
}

export function useInstallFromUrl(kind: LibraryKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => tauriLibrary.installFromUrl(url),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.userLibrary(kind) });
    },
  });
}

export function useCopyLibraryToAgent(
  kind: LibraryKind,
  agentPath: string | undefined,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => {
      if (!agentPath) throw new Error("agentPath required");
      return tauriLibrary.copyToAgent(kind, slug, agentPath);
    },
    onSuccess: () => {
      if (agentPath) {
        qc.invalidateQueries({ queryKey: queryKeys.skills(agentPath) });
      }
    },
  });
}
