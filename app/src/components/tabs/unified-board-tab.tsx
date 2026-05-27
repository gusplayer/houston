import type { TabProps } from "../../lib/types";
import { UnifiedBoard } from "../unified-board";

/** Thin TabProps adapter — UnifiedBoard pulls its agent list from the
 * workspace agent store, so the per-agent tab context just renders it
 * with no extra props. Dashboard renders <UnifiedBoard> directly so it
 * can pass mission-related props. */
export default function UnifiedBoardTab(_: TabProps) {
  return <UnifiedBoard />;
}
