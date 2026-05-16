import { useEffect } from "react";
import { useUIStore } from "../../stores/ui";
import type { StoreListing } from "../../lib/types";

interface Options {
  /** Merged Houston + community catalog the Store page renders. */
  merged: StoreListing[];
  /** Called when the deep-link target is found in `merged`. */
  onMatch: (listing: StoreListing) => void;
  /** Called when `merged` does not contain a listing for the requested id.
   * The Store page renders a fallback "agent not yet available" dialog. */
  onMissing: (agentId: string) => void;
}

/**
 * React glue between the `store://deep-link` listener (which writes the
 * requested agent id into `useUIStore.storeAgentId`) and the Store page's
 * dialog state.
 *
 * Effect runs whenever `storeAgentId` or the merged catalog changes:
 *   - found in `merged` → call `onMatch(listing)` and clear `storeAgentId`.
 *   - not found        → call `onMissing(agentId)` and clear `storeAgentId`.
 *
 * Clearing is what guarantees the effect does not loop. Both `onMatch`
 * and `onMissing` must be stable refs (e.g. wrapped in `useCallback`)
 * if the caller wants to avoid re-running when the merged list changes
 * for unrelated reasons; in practice the early return on `storeAgentId
 * === null` keeps the work trivial.
 */
export function useStoreDeepLink({ merged, onMatch, onMissing }: Options): void {
  const storeAgentId = useUIStore((s) => s.storeAgentId);
  const setStoreAgentId = useUIStore((s) => s.setStoreAgentId);

  useEffect(() => {
    if (!storeAgentId) return;
    const match = merged.find((l) => l.id === storeAgentId);
    if (match) {
      onMatch(match);
    } else {
      onMissing(storeAgentId);
    }
    setStoreAgentId(null);
  }, [storeAgentId, merged, onMatch, onMissing, setStoreAgentId]);
}
