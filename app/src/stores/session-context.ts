import { create } from "zustand";

export interface AgentContextUsage {
  /** Input-side tokens fed to the model on the latest turn. */
  used: number;
  /** Model context window (e.g. 200000). */
  max: number;
  /** Claude session id of the latest turn — lets the terminal query this
   * session's cost/tokens without leaving the view. */
  sessionKey: string;
}

interface SessionContextState {
  /** Latest context usage per agent folder path. */
  byAgent: Record<string, AgentContextUsage>;
  setContext: (
    agentPath: string,
    used: number,
    max: number,
    sessionKey: string,
  ) => void;
}

// Tracks how full each agent's context window is, derived from the latest
// assistant turn in the transcript (SessionUsageChanged). Drives the
// terminal's context bar so the user can tell when to /compact or /clear,
// plus the inline cost readout for the live session.
export const useSessionContextStore = create<SessionContextState>((set) => ({
  byAgent: {},
  setContext: (agentPath, used, max, sessionKey) =>
    set((s) => ({
      byAgent: { ...s.byAgent, [agentPath]: { used, max, sessionKey } },
    })),
}));
