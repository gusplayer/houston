import { useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CheckCheck, Eraser, Minimize2, PanelRightClose, Plus } from "lucide-react";
import { Button, ConfirmDialog, cn } from "@squad/core";
import { SquadTerminal, type SquadTerminalHandle } from "@squad/terminal";
import { getEngine } from "../../lib/engine";
import { useUIStore } from "../../stores/ui";
import { useSessionContextStore } from "../../stores/session-context";
import { useSessionUsage } from "../../hooks/queries/use-usage";
import { formatUsd } from "../usage/helpers";

interface TerminalDockProps {
  agent: { id: string; name: string; folderPath: string };
  /** Detach the panel (PTY keeps running in the engine for reattach). */
  onHide: () => void;
  /** Open the workspace usage view. */
  onOpenUsage: () => void;
}

/** Actions that finalize or wipe state, so they go through a confirm step. */
type PendingAction = "finish" | "newTask" | "clear" | null;

/**
 * The right-dock terminal: header, the live xterm, a context-usage bar, and a
 * toolbar wired to the live PTY.
 *
 * - Finish: kills the PTY (engine moves the card to Done) and closes the dock.
 * - New task: kills the current session and remounts with a fresh session key
 *   so `claude` starts a brand-new conversation (no `--resume`).
 * - Compact / Clear: send `/compact` / `/clear` to the running `claude` — the
 *   same context-management commands the user could type, surfaced as buttons.
 * - Usage: opens the workspace usage view.
 *
 * Finalizing/destructive actions (Finish, New task, Clear) confirm first.
 */
export function TerminalDock({ agent, onHide, onOpenUsage }: TerminalDockProps) {
  const { t } = useTranslation("shell");
  const addToast = useUIStore((s) => s.addToast);
  const taskNonce = useUIStore((s) => s.terminalTaskNonce[agent.folderPath] ?? 0);
  const bumpTaskNonce = useUIStore((s) => s.bumpTerminalTaskNonce);
  const terminalRef = useRef<SquadTerminalHandle>(null);
  const ctx = useSessionContextStore((s) => s.byAgent[agent.folderPath]);
  // Cost of the live session, shown inline so the user never leaves the
  // terminal to see "how much did this cost". The full breakdown is a click
  // away via the Usage link.
  const sessionUsage = useSessionUsage(agent.folderPath, ctx?.sessionKey, "anthropic");
  const sessionCost = sessionUsage.data?.costUsd ?? null;
  const [pending, setPending] = useState<PendingAction>(null);

  // `taskNonce` is read from the UI store (persisted in localStorage) so a
  // Done click clears the resume slot even across dock close/reopen and app
  // reloads. 0 = the agent's default chat session (continues an existing
  // conversation); any other value forces a fresh `claude` session.

  const sessionKey = useMemo(
    () => (taskNonce === 0 ? `chat-${agent.id}` : `chat-${agent.id}-${taskNonce}`),
    [agent.id, taskNonce],
  );
  const wsUrl = useMemo(
    () => getEngine().ptyWsUrl(agent.folderPath, { sessionKey }),
    [agent.folderPath, sessionKey],
  );

  const contextPct =
    ctx && ctx.max > 0 ? Math.min(100, Math.round((ctx.used / ctx.max) * 100)) : null;

  const toastKillError = (err: unknown) =>
    addToast({
      title: t("terminal.endError"),
      description: err instanceof Error ? err.message : String(err),
      variant: "error",
    });

  const doFinish = async () => {
    // Await the kill so the engine has actually torn the PTY down (and moved
    // its activity card to Done) BEFORE we close the dock. Closing first and
    // racing the kill made it look like nothing happened — the user reopened
    // and got handed the still-alive PTY back.
    try {
      await getEngine().killPty(agent.folderPath);
    } catch (err) {
      toastKillError(err);
    }
    // Bump the persisted nonce so the next time the user opens this agent's
    // terminal — even after closing the dock or reloading the app — Squad
    // connects with a fresh sessionKey, not `--resume`-ing the now-finished
    // conversation. Without this, reopening would land back in the old chat.
    bumpTaskNonce(agent.folderPath);
    onHide();
  };

  const doNewTask = async () => {
    try {
      await getEngine().killPty(agent.folderPath);
    } catch (err) {
      toastKillError(err);
      return;
    }
    // Fresh, unique session key → new `claude` conversation (no resume).
    bumpTaskNonce(agent.folderPath);
  };

  // Context commands go straight to the live REPL. `\r` submits the line.
  const doClear = () => terminalRef.current?.sendInput("/clear\r");
  const handleCompact = () => terminalRef.current?.sendInput("/compact\r");

  const confirmCopy: Record<
    Exclude<PendingAction, null>,
    { title: string; body: string; confirmLabel: string }
  > = {
    finish: {
      title: t("terminal.toolbar.finishConfirmTitle"),
      body: t("terminal.toolbar.finishConfirmBody"),
      confirmLabel: t("terminal.toolbar.finish"),
    },
    newTask: {
      title: t("terminal.toolbar.newTaskConfirmTitle"),
      body: t("terminal.toolbar.newTaskConfirmBody"),
      confirmLabel: t("terminal.toolbar.newTask"),
    },
    clear: {
      title: t("terminal.toolbar.clearConfirmTitle"),
      body: t("terminal.toolbar.clearConfirmBody"),
      confirmLabel: t("terminal.toolbar.clear"),
    },
  };

  const runPending = () => {
    const action = pending;
    setPending(null);
    if (action === "finish") void doFinish();
    else if (action === "newTask") void doNewTask();
    else if (action === "clear") doClear();
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground truncate">
          {t("terminal.title", { name: agent.name })}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          title={t("terminal.hide")}
          aria-label={t("terminal.hide")}
          onClick={onHide}
        >
          <PanelRightClose className="size-4" />
        </Button>
      </div>

      <SquadTerminal
        ref={terminalRef}
        // Remount cleanly when switching agents or starting a new task so the
        // old socket fully tears down before the new one connects.
        key={`${agent.folderPath}:${taskNonce}`}
        wsUrl={wsUrl}
        className="flex-1 min-h-0 overflow-hidden"
        onClose={onHide}
      />

      {/* Terminal-style toolbar: black background, monospace text, uniform
          sizing — visually a continuation of the xterm above. All items
          share `text-xs font-mono`; buttons are plain so the Button
          component's themed colors don't override the white-on-black look. */}
      <div className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 border-t border-white/10 bg-black text-xs font-mono text-white/90">
        {ctx && (
          <div className="flex items-center gap-3">
            {contextPct != null && (
              <span
                className="flex items-center gap-1.5"
                title={t("terminal.toolbar.contextHint", { pct: contextPct })}
              >
                <span className="text-white/70">{t("terminal.toolbar.context")}</span>
                <div className="h-1.5 w-16 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      contextPct >= 80
                        ? "bg-red-500"
                        : contextPct >= 50
                          ? "bg-amber-500"
                          : "bg-emerald-500",
                    )}
                    style={{ width: `${contextPct}%` }}
                  />
                </div>
                <span className="tabular-nums">{contextPct}%</span>
              </span>
            )}
            {sessionCost != null && (
              <span className="tabular-nums text-white/80" title={t("terminal.toolbar.costHint")}>
                ≈ {formatUsd(sessionCost)}
              </span>
            )}
            <button
              type="button"
              onClick={onOpenUsage}
              className="text-white/70 hover:text-white hover:underline"
              title={t("terminal.toolbar.usageHint")}
            >
              {t("terminal.toolbar.usage")}
            </button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          <ToolbarButton
            icon={<Minimize2 className="size-3.5" />}
            label={t("terminal.toolbar.compact")}
            title={t("terminal.toolbar.compactHint")}
            onClick={handleCompact}
          />
          <ToolbarButton
            icon={<Eraser className="size-3.5" />}
            label={t("terminal.toolbar.clear")}
            title={t("terminal.toolbar.clearHint")}
            onClick={() => setPending("clear")}
          />
          <ToolbarButton
            icon={<Plus className="size-3.5" />}
            label={t("terminal.toolbar.newTask")}
            title={t("terminal.toolbar.newTaskHint")}
            onClick={() => setPending("newTask")}
          />
          <ToolbarButton
            icon={<CheckCheck className="size-3.5" />}
            label={t("terminal.toolbar.finish")}
            title={t("terminal.toolbar.finishHint")}
            onClick={() => setPending("finish")}
          />
        </div>
      </div>

      {/* All toolbar actions share this shape so font, size, padding, and
          hover stay uniform. Plain button (not the themed Button component)
          keeps the white-on-black terminal look from being overridden. */}
      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setPending(null);
          }}
          variant="default"
          title={confirmCopy[pending].title}
          description={confirmCopy[pending].body}
          confirmLabel={confirmCopy[pending].confirmLabel}
          cancelLabel={t("terminal.toolbar.cancel")}
          onConfirm={runPending}
        />
      )}
    </div>
  );
}

/** Action button used in the terminal toolbar. Plain button so the white-on-
 * black terminal styling isn't overridden by the themed Button component;
 * every action gets the same size, font, padding, and hover. */
function ToolbarButton({
  icon,
  label,
  title,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono text-white/90 hover:text-white hover:bg-white/10 transition-colors"
    >
      {icon}
      {label}
    </button>
  );
}
