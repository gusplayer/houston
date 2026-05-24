import { useMemo } from "react";
import type { SessionUsage } from "@squad/engine-client";
import type { Agent } from "../../lib/types";
import { formatTokens, formatUsd, resolveAgentName } from "./helpers";
import { Section } from "./section";

export interface RecentSessionsLabels {
  title: string;
  empty: string;
  window: string;
  cost: string;
  inspect: string;
  turns: string;
}

export function RecentSessions({
  sessions,
  agents,
  onOpenSession,
  labels,
}: {
  sessions: SessionUsage[];
  agents: Agent[];
  onOpenSession: (agentPath: string, sessionKey: string) => void;
  labels: RecentSessionsLabels;
}) {
  if (sessions.length === 0) {
    return (
      <Section title={labels.title}>
        <div className="text-sm text-muted-foreground">{labels.empty}</div>
      </Section>
    );
  }
  return (
    <Section title={labels.title}>
      <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
        {sessions.slice(0, 25).map((s) => (
          <SessionRow
            key={`${s.sessionKey}:${s.provider}`}
            session={s}
            displayName={resolveAgentName(agents, s.agentPath)}
            onOpen={() => onOpenSession(s.agentPath, s.sessionKey)}
            labels={labels}
          />
        ))}
      </div>
    </Section>
  );
}

function SessionRow({
  session,
  displayName,
  onOpen,
  labels,
}: {
  session: SessionUsage;
  displayName: string;
  onOpen: () => void;
  labels: { window: string; cost: string; inspect: string; turns: string };
}) {
  const pct = useMemo(() => {
    if (!session.contextWindow || session.contextWindow === 0) return null;
    return Math.min(100, Math.round((session.lastWindowTokens / session.contextWindow) * 100));
  }, [session.contextWindow, session.lastWindowTokens]);
  return (
    <div className="flex items-center gap-3 px-3 py-2 hover:bg-accent/40">
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{displayName}</div>
        <div className="text-xs text-muted-foreground truncate">
          {session.provider} · {session.turns} {labels.turns}
          {session.lastModel ? ` · ${session.lastModel}` : ""}
        </div>
      </div>
      <div className="hidden sm:flex flex-col items-end shrink-0 w-32">
        <div className="text-xs text-muted-foreground">{labels.window}</div>
        {pct !== null ? (
          <div className="w-full">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <div className="text-[11px] text-muted-foreground text-right">
              {pct}%
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground">
            {formatTokens(session.lastWindowTokens)}
          </div>
        )}
      </div>
      <div className="text-sm font-medium tabular-nums shrink-0 w-20 text-right">
        ≈ {formatUsd(session.costUsd)}
      </div>
      <button
        onClick={onOpen}
        className="text-xs text-primary hover:underline shrink-0"
      >
        {labels.inspect}
      </button>
    </div>
  );
}
