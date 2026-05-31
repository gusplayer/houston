import { useQuery } from "@tanstack/react-query";
import type { LibraryKind } from "@squad/engine-client";
import { queryKeys } from "../../lib/query-keys";
import { searchCommunityCatalog } from "../../lib/github-topic-search";

/**
 * Community catalog discovery via GitHub topic search.
 *
 * Cached aggressively (1h fresh, 24h stale) so browsing the library
 * does not burn GitHub's unauthenticated 10-req/min limit. The user
 * explicitly typing a new query bypasses the cache via a different key.
 */
export function useLibraryCatalog(kind: LibraryKind, query: string) {
  return useQuery({
    queryKey: queryKeys.libraryCatalog(kind, query),
    queryFn: () => searchCommunityCatalog(kind, query),
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}
