import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@squad/core";
import type { UsageRange } from "@squad/engine-client";
import { useWorkspaceStore } from "../stores/workspaces";
import { useAgentStore } from "../stores/agents";
import { useAgentCatalogStore } from "../stores/agent-catalog";
import { useWorkspaceUsage } from "../hooks/queries/use-usage";
import { WorkspaceTotals } from "./usage/usage-totals";
import { AgentUsageList } from "./usage/usage-agent-list";
import { SessionDetailDrawer } from "./usage/usage-detail-drawer";

const RANGES: UsageRange[] = ["today", "7d", "30d", "all"];

export function UsageDashboard() {
  const { t } = useTranslation(["usage", "common"]);
  const workspace = useWorkspaceStore((s) => s.current);
  const agents = useAgentStore((s) => s.agents);
  const getById = useAgentCatalogStore((s) => s.getById);
  const [range, setRange] = useState<UsageRange>("today");

  const getRole = (agentPath: string) => {
    const a = agents.find((x) => x.folderPath === agentPath);
    return (a && getById(a.configId)?.config.roleLabel) || "";
  };
  const getColor = (agentPath: string) =>
    agents.find((x) => x.folderPath === agentPath)?.color;
  const [openSession, setOpenSession] = useState<{
    agentPath: string;
    sessionKey: string;
  } | null>(null);

  const { data, isLoading } = useWorkspaceUsage(workspace?.id, range);

  if (!workspace) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {t("usage:noWorkspace")}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2 border-b border-border">
        <div className="text-sm font-medium">{t("usage:title")}</div>
        <RangeToggle
          value={range}
          onChange={setRange}
          labels={{
            today: t("usage:range.today"),
            "7d": t("usage:range.7d"),
            "30d": t("usage:range.30d"),
            all: t("usage:range.all"),
          }}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <WorkspaceTotals
          totals={data?.totals}
          loading={isLoading}
          labels={{
            cost: t("usage:totals.cost"),
            tokens: t("usage:totals.tokens"),
            sessions: t("usage:totals.sessions"),
            turns: t("usage:totals.turns"),
            costHelp: t("usage:totals.costHelp"),
            costTooltip: t("usage:totals.costTooltip"),
            empty: t("usage:totals.empty"),
          }}
        />

        <AgentUsageList
          agents={data?.agents ?? []}
          sessions={data?.sessions ?? []}
          allAgents={agents}
          totalCost={data?.totals.costUsd ?? 0}
          getRole={getRole}
          getColor={getColor}
          onOpenSession={(agentPath, sessionKey) =>
            setOpenSession({ agentPath, sessionKey })
          }
          labels={{
            title: t("usage:agents.title"),
            sessions: t("usage:agents.sessions"),
            tokens: t("usage:agents.tokens"),
            turns: t("usage:agents.turns"),
            empty: t("usage:agents.empty"),
            byModel: t("usage:agents.byModel"),
            recentSessions: t("usage:agents.recentSessions"),
            context: t("usage:agents.context"),
            details: t("usage:agents.details"),
          }}
        />
      </div>

      {openSession && (
        <SessionDetailDrawer
          agentPath={openSession.agentPath}
          sessionKey={openSession.sessionKey}
          onClose={() => setOpenSession(null)}
        />
      )}
    </div>
  );
}

function RangeToggle({
  value,
  onChange,
  labels,
}: {
  value: UsageRange;
  onChange: (r: UsageRange) => void;
  labels: Record<UsageRange, string>;
}) {
  return (
    <div className="flex items-center gap-1">
      {RANGES.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={cn(
            "px-2.5 py-1 rounded-md text-xs transition-colors",
            value === r
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent",
          )}
        >
          {labels[r]}
        </button>
      ))}
    </div>
  );
}
