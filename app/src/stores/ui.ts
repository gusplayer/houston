import { create } from "zustand";
import type { RoutineFormData } from "@squad/routines";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: "error" | "success" | "info";
  action?: { label: string; onClick: () => void };
}

export type JobDescriptionTarget = "instructions" | "rules" | "skills" | "learnings" | "mcp";

interface UIState {
  viewMode: string;
  assistantPanelOpen: boolean;
  activityPanelId: string | null;
  claudeAvailable: boolean | null;
  /** Provider ID that needs re-auth (e.g. "anthropic", "openai"), or null if OK */
  authRequired: string | null;
  toasts: ToastItem[];
  createAgentDialogOpen: boolean;
  /** G.3 — Recruit Team dialog. Multi-select role agents and create
   * them all at once for a one-click team setup. */
  recruitTeamDialogOpen: boolean;
  /** Callback registered by the board tab to open the new-mission panel */
  onStartMission: (() => void) | null;
  /** Extra create actions registered by the board tab (e.g. "New Planning Session"). */
  boardActions: Array<{ id: string; label: string; onClick: () => void }>;
  /** Per-agent mission search query shown in the agent header. */
  agentMissionSearchQueries: Record<string, string>;
  /** Whether a per-agent mission search is loading conversation text. */
  agentMissionSearchLoading: Record<string, boolean>;
  /** Whether the mission chat panel is open (hides tab bar for full-height panel) */
  missionPanelOpen: boolean;
  /** Which view is shown inside the side panel: chat messages or embedded xterm. */
  chatPanelViewMode: "chat" | "terminal";
  /** Width in pixels of the right dock that hosts the mission/terminal
   * panel. Persisted (lazily from localStorage on init) so the user's
   * preferred ratio survives navigation and app restarts. */
  dockWidth: number;
  jobDescriptionTarget: JobDescriptionTarget | null;
  /** Currently-open conversation per agent. Persisted in the store so
   * navigating away from the agent (Settings, another agent, …) and back
   * preserves the open chat. Keyed by agent folder path. */
  selectedConversationByAgent: Record<string, string | null>;
  /** Pin the first-run tutorial UI in front of the workspace shell. Set true
   * while the orchestrator is mid-flight, cleared on graduation or skip. */
  tutorialActive: boolean;
  /** Render the post-tutorial UI tour overlay over the workspace shell.
   * Set when the user completes M3 Try and clicks "Tutorial complete";
   * cleared when the user dismisses the final tour step. */
  uiTourActive: boolean;
  /** Agent id requested by a `squad://store/agent/<id>` deep link. When
   * non-null, the Store page should switch to view-mode "store" and open
   * the detail dialog for this agent. Cleared by the Store page once it
   * has handled the request (either by opening the listing or by surfacing
   * a "not found" fallback). */
  storeAgentId: string | null;
  /** Pending instruction improvement proposed by the engine after a session
   * completes. When non-null, shows an inline diff chip in the chat panel.
   * Cleared on apply, dismiss, or when a new suggestion arrives for the same
   * agent. */
  instructionSuggestion: {
    agentPath: string;
    suggestion: {
      section_name: string;
      proposed_text: string;
      reason: string;
    };
  } | null;
  /** Transient pre-fill data for the routine editor. Set by the
   * "Save as routine" chip in chat; consumed and cleared by RoutinesTab
   * on mount or when it detects a pending value. */
  routinePrefill: Partial<RoutineFormData> | null;
  /** One-shot request to open the dashboard on a specific sub-view
   * ("missions" | "phases" | "usage"). Set by the terminal toolbar's Usage
   * action alongside `setViewMode("dashboard")`; consumed and cleared by the
   * Dashboard on mount. */
  pendingDashboardView: string | null;
  setPendingDashboardView: (view: string | null) => void;
  /** Per-agent suffix bumped when the user ends or restarts the terminal
   * conversation. Combined into the WS sessionKey so the next attach lands
   * on a fresh claude session instead of `--resume`-ing the old one. */
  terminalTaskNonce: Record<string, number>;
  bumpTerminalTaskNonce: (agentPath: string) => void;
  setRoutinePrefill: (data: Partial<RoutineFormData> | null) => void;
  setViewMode: (mode: string) => void;
  setAssistantPanelOpen: (open: boolean) => void;
  setActivityPanelId: (id: string | null) => void;
  setClaudeAvailable: (available: boolean | null) => void;
  setAuthRequired: (provider: string | null) => void;
  addToast: (toast: Omit<ToastItem, "id">) => void;
  dismissToast: (id: string) => void;
  setCreateAgentDialogOpen: (open: boolean) => void;
  setRecruitTeamDialogOpen: (open: boolean) => void;
  setOnStartMission: (cb: (() => void) | null) => void;
  setBoardActions: (actions: Array<{ id: string; label: string; onClick: () => void }>) => void;
  setAgentMissionSearchQuery: (agentPath: string, query: string) => void;
  setAgentMissionSearchLoading: (agentPath: string, loading: boolean) => void;
  setMissionPanelOpen: (open: boolean) => void;
  setChatPanelViewMode: (mode: "chat" | "terminal") => void;
  setDockWidth: (width: number) => void;
  setJobDescriptionTarget: (target: JobDescriptionTarget | null) => void;
  setTutorialActive: (active: boolean) => void;
  setUiTourActive: (active: boolean) => void;
  setStoreAgentId: (id: string | null) => void;
  setSelectedConversation: (agentPath: string, id: string | null) => void;
  setInstructionSuggestion: (v: UIState["instructionSuggestion"]) => void;
}

let toastCounter = 0;

const DOCK_WIDTH_KEY = "squad.dockWidth";
const DOCK_WIDTH_DEFAULT = 560;
const DOCK_WIDTH_MIN = 360;
const DOCK_WIDTH_MAX = 1200;

const CHAT_PANEL_VIEW_MODE_KEY = "squad.chatPanelViewMode";
const TERMINAL_TASK_NONCE_KEY = "squad.terminalTaskNonce";

function readInitialTerminalTaskNonce(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(TERMINAL_TASK_NONCE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

// Remember the surface the user last used (chat vs terminal) so opening a
// card reopens the same one instead of flipping between them.
function readInitialChatPanelViewMode(): "chat" | "terminal" {
  if (typeof window === "undefined") return "terminal";
  return window.localStorage.getItem(CHAT_PANEL_VIEW_MODE_KEY) === "chat"
    ? "chat"
    : "terminal";
}

function readInitialDockWidth(): number {
  if (typeof window === "undefined") return DOCK_WIDTH_DEFAULT;
  const raw = window.localStorage.getItem(DOCK_WIDTH_KEY);
  if (!raw) return DOCK_WIDTH_DEFAULT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DOCK_WIDTH_DEFAULT;
  return Math.min(DOCK_WIDTH_MAX, Math.max(DOCK_WIDTH_MIN, n));
}

export const useUIStore = create<UIState>((set) => ({
  viewMode: "chat",
  assistantPanelOpen: false,
  activityPanelId: null,
  claudeAvailable: null,
  authRequired: null,
  toasts: [],
  createAgentDialogOpen: false,
  recruitTeamDialogOpen: false,
  onStartMission: null,
  boardActions: [],
  agentMissionSearchQueries: {},
  agentMissionSearchLoading: {},
  missionPanelOpen: false,
  chatPanelViewMode: readInitialChatPanelViewMode(),
  dockWidth: readInitialDockWidth(),
  jobDescriptionTarget: null,
  tutorialActive: false,
  uiTourActive: false,
  storeAgentId: null,
  instructionSuggestion: null,
  routinePrefill: null,
  pendingDashboardView: null,
  terminalTaskNonce: readInitialTerminalTaskNonce(),
  selectedConversationByAgent: {},

  setPendingDashboardView: (pendingDashboardView) => set({ pendingDashboardView }),
  bumpTerminalTaskNonce: (agentPath) =>
    set((s) => {
      const next = { ...s.terminalTaskNonce, [agentPath]: Date.now() };
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(TERMINAL_TASK_NONCE_KEY, JSON.stringify(next));
        } catch {
          // ignore quota / serialization failures
        }
      }
      return { terminalTaskNonce: next };
    }),
  setRoutinePrefill: (routinePrefill) => set({ routinePrefill }),
  setViewMode: (viewMode) => set({ viewMode }),
  setAssistantPanelOpen: (assistantPanelOpen) => set({ assistantPanelOpen }),
  setActivityPanelId: (activityPanelId) => set({ activityPanelId }),
  setClaudeAvailable: (claudeAvailable) => set({ claudeAvailable }),
  setAuthRequired: (authRequired) => set({ authRequired }),

  addToast: (toast) =>
    set((s) => {
      const isDuplicate = s.toasts.some(
        (t) => t.title === toast.title && t.description === toast.description,
      );
      if (isDuplicate) return s;

      const id = `toast-${++toastCounter}`;
      const timeout = toast.action ? 10000 : 5000;
      setTimeout(() => {
        set((prev) => ({ toasts: prev.toasts.filter((t) => t.id !== id) }));
      }, timeout);
      return { toasts: [...s.toasts, { ...toast, id }] };
    }),

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setCreateAgentDialogOpen: (createAgentDialogOpen) =>
    set({ createAgentDialogOpen }),
  setRecruitTeamDialogOpen: (recruitTeamDialogOpen) =>
    set({ recruitTeamDialogOpen }),

  setOnStartMission: (onStartMission) => set({ onStartMission }),
  setBoardActions: (boardActions) => set({ boardActions }),
  setAgentMissionSearchQuery: (agentPath, query) =>
    set((s) => {
      const next = { ...s.agentMissionSearchQueries };
      if (query) next[agentPath] = query;
      else delete next[agentPath];
      return { agentMissionSearchQueries: next };
    }),
  setAgentMissionSearchLoading: (agentPath, loading) =>
    set((s) => {
      const next = { ...s.agentMissionSearchLoading };
      if (loading) next[agentPath] = true;
      else delete next[agentPath];
      return { agentMissionSearchLoading: next };
    }),
  setMissionPanelOpen: (missionPanelOpen) => set({ missionPanelOpen }),
  setChatPanelViewMode: (chatPanelViewMode) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CHAT_PANEL_VIEW_MODE_KEY, chatPanelViewMode);
    }
    set({ chatPanelViewMode });
  },
  setDockWidth: (rawWidth) => {
    const width = Math.min(DOCK_WIDTH_MAX, Math.max(DOCK_WIDTH_MIN, Math.round(rawWidth)));
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DOCK_WIDTH_KEY, String(width));
    }
    set({ dockWidth: width });
  },
  setJobDescriptionTarget: (jobDescriptionTarget) => set({ jobDescriptionTarget }),
  setTutorialActive: (tutorialActive) => set({ tutorialActive }),
  setUiTourActive: (uiTourActive) => set({ uiTourActive }),
  setStoreAgentId: (storeAgentId) => set({ storeAgentId }),
  setSelectedConversation: (agentPath, id) =>
    set((s) => {
      const next = { ...s.selectedConversationByAgent };
      if (id === null) delete next[agentPath];
      else next[agentPath] = id;
      return { selectedConversationByAgent: next };
    }),
  setInstructionSuggestion: (v) => set({ instructionSuggestion: v }),
}));
