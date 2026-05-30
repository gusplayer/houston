import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { SquadAvatar, resolveAgentColor, cn } from "@squad/core";
import type { AgentUsage, SessionUsage } from "@squad/engine-client";
import type { Agent } from "../../lib/types";
import { formatTokens, formatUsd, resolveAgentName } from "./helpers";
import { Section } from "./section";

export interface AgentUsageListLabels {
  title: string;
  sessions: string;
  tokens: string;
  turns: string;
  empty: string;
  byModel: string;
  recentSessions: string;
  context: string;
  details: string;
}

function sessionTokens(s: SessionUsage): number {
  return (
    s.inputTokens +
    s.outputTokens +
    s.cacheCreationInputTokens +
    s.cacheReadInputTokens
  );
}

/**
 * One row per agent (never repeated), expandable to reveal the agent's
 * spend by model plus its recent sessions. Replaces the old "By agent" cards
 * + flat "Recent sessions" list, which repeated each agent once per session.
 */
export function AgentUsageList({
  agents,
  sessions,
  allAgents,
  totalCost,
  getRole,
  getColor,
  onOpenSession,
  labels,
}: {
  agents: AgentUsage[];
  sessions: SessionUsage[];
  allAgents: Agent[];
  totalCost: number;
  getRole: (agentPath: string) => string;
  getColor: (agentPath: string) => string | undefined;
  onOpenSession: (agentPath: string, sessionKey: string) => void;
  labels: AgentUsageListLabels;
}) {
  const sessionsByAgent = useMemo(() => {
    const map: Record<string, SessionUsage[]> = {};
    for (const s of sessions) (map[s.agentPath] ??= []).push(s);
    return map;
  }, [sessions]);

  if (agents.length === 0) {
    return (
      <Section title={labels.title}>
        <div className="text-sm text-muted-foreground">{labels.empty}</div>
      </Section>
    );
  }

  return (
    <Section title={labels.title}>
      <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
        {agents.map((agent) => (
          <AgentRow
            key={agent.agentPath}
            agent={agent}
            sessions={sessionsByAgent[agent.agentPath] ?? []}
            displayName={resolveAgentName(allAgents, agent.agentPath)}
            role={getRole(agent.agentPath)}
            color={getColor(agent.agentPath)}
            totalCost={totalCost}
            onOpenSession={onOpenSession}
            labels={labels}
          />
        ))}
      </div>
    </Section>
  );
}

function AgentRow({
  agent,
  sessions,
  displayName,
  role,
  color,
  totalCost,
  onOpenSession,
  labels,
}: {
  agent: AgentUsage;
  sessions: SessionUsage[];
  displayName: string;
  role: string;
  color: string | undefined;
  totalCost: number;
  onOpenSession: (agentPath: string, sessionKey: string) => void;
  labels: AgentUsageListLabels;
}) {
  const [expanded, setExpanded] = useState(false);

  const totalTokens =
    agent.inputTokens +
    agent.outputTokens +
    agent.cacheCreationInputTokens +
    agent.cacheReadInputTokens;
  const sharePct = totalCost > 0 ? Math.round((agent.costUsd / totalCost) * 100) : 0;

  const byModel = useMemo(() => {
    const map = new Map<string, { cost: number; tokens: number }>();
    for (const s of sessions) {
      const key = s.lastModel ?? "unknown";
      const entry = map.get(key) ?? { cost: 0, tokens: 0 };
      entry.cost += s.costUsd;
      entry.tokens += sessionTokens(s);
      map.set(key, entry);
    }
    return [...map.entries()].sort((a, b) => b[1].cost - a[1].cost);
  }, [sessions]);

  const recent = useMemo(
    () =>
      [...sessions]
        .sort((a, b) => (a.lastTurnAt < b.lastTurnAt ? 1 : -1))
        .slice(0, 12),
    [sessions],
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/40"
      >
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-90",
          )}
        />
        <SquadAvatar color={resolveAgentColor(color)} diameter={22} />
        <div className="flex-1 min-w-0">
          <div className="text-sm truncate">{displayName}</div>
          <div className="text-xs text-muted-foreground truncate">
            {role ? `${role} · ` : ""}
            {agent.sessions} {labels.sessions} · {formatTokens(totalTokens)}{" "}
            {labels.tokens}
          </div>
        </div>
        <div className="hidden sm:block w-24 shrink-0">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.min(100, sharePct)}%` }}
            />
          </div>
        </div>
        <div className="text-sm font-semibold tabular-nums shrink-0 w-20 text-right">
          ≈ {formatUsd(agent.costUsd)}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pl-12 space-y-3 bg-accent/20">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {labels.byModel}
            </div>
            {byModel.map(([model, m]) => (
              <div
                key={model}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="truncate text-muted-foreground">{model}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatTokens(m.tokens)} {labels.tokens} · ≈ {formatUsd(m.cost)}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {labels.recentSessions}
            </div>
            <div className="rounded-md border border-border overflow-hidden divide-y divide-border bg-background">
              {recent.map((s) => (
                <SessionRow
                  key={`${s.sessionKey}:${s.provider}`}
                  session={s}
                  onOpen={() => onOpenSession(s.agentPath, s.sessionKey)}
                  labels={labels}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SessionRow({
  session,
  onOpen,
  labels,
}: {
  session: SessionUsage;
  onOpen: () => void;
  labels: { turns: string; context: string; details: string };
}) {
  const pct =
    session.contextWindow && session.contextWindow > 0
      ? Math.min(100, Math.round((session.lastWindowTokens / session.contextWindow) * 100))
      : null;
  return (
    <div className="flex items-center gap-3 px-3 py-2 text-xs">
      <div className="flex-1 min-w-0 text-muted-foreground truncate">
        {session.turns} {labels.turns}
        {session.lastModel ? ` · ${session.lastModel}` : ""}
      </div>
      {pct !== null && (
        <div className="hidden sm:flex items-center gap-1.5 shrink-0 text-muted-foreground">
          <span className="text-[10px] uppercase tracking-wide">{labels.context}</span>
          <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <span className="tabular-nums text-[10px]">{pct}%</span>
        </div>
      )}
      <div className="font-medium tabular-nums shrink-0 w-16 text-right">
        ≈ {formatUsd(session.costUsd)}
      </div>
      <button onClick={onOpen} className="text-primary hover:underline shrink-0">
        {labels.details}
      </button>
    </div>
  );
}
