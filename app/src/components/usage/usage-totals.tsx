import type { AgentUsage } from "@squad/engine-client";
import { formatTokens, formatUsd } from "./helpers";

export interface UsageTotalsLabels {
  cost: string;
  tokens: string;
  sessions: string;
  turns: string;
  costHelp: string;
  costTooltip: string;
  empty: string;
}

export function WorkspaceTotals({
  totals,
  loading,
  labels,
}: {
  totals?: AgentUsage;
  loading: boolean;
  labels: UsageTotalsLabels;
}) {
  if (loading && !totals) {
    return <div className="text-sm text-muted-foreground">{labels.empty}</div>;
  }
  if (!totals || totals.sessions === 0) {
    return <div className="text-sm text-muted-foreground">{labels.empty}</div>;
  }
  const totalTokens =
    totals.inputTokens +
    totals.outputTokens +
    totals.cacheCreationInputTokens +
    totals.cacheReadInputTokens;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Stat
        title={labels.cost}
        value={`≈ ${formatUsd(totals.costUsd)}`}
        hint={labels.costHelp}
        tooltip={labels.costTooltip}
      />
      <Stat title={labels.tokens} value={formatTokens(totalTokens)} />
      <Stat title={labels.sessions} value={String(totals.sessions)} />
      <Stat title={labels.turns} value={String(totals.turns)} />
    </div>
  );
}

function Stat({
  title,
  value,
  hint,
  tooltip,
}: {
  title: string;
  value: string;
  hint?: string;
  tooltip?: string;
}) {
  return (
    <div
      className="rounded-lg border border-border bg-card px-3 py-2"
      title={tooltip}
    >
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="text-lg font-semibold">{value}</div>
      {hint && (
        <div className={tooltip ? "text-[11px] text-muted-foreground cursor-help" : "text-[11px] text-muted-foreground"}>
          {hint}
        </div>
      )}
    </div>
  );
}
