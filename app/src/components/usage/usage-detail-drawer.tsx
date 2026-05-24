import { useTranslation } from "react-i18next";
import { useSessionContextBreakdown } from "../../hooks/queries/use-usage";
import { formatNumber, formatTokens } from "./helpers";

export function SessionDetailDrawer({
  agentPath,
  sessionKey,
  onClose,
}: {
  agentPath: string;
  sessionKey: string;
  onClose: () => void;
}) {
  const { t } = useTranslation(["usage", "common"]);
  const { data, isLoading } = useSessionContextBreakdown(agentPath, sessionKey);
  return (
    <div className="absolute inset-0 z-50 bg-black/30 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-md h-full bg-card border-l border-border shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <div className="text-sm font-medium">{t("usage:breakdown.title")}</div>
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {t("common:actions.close")}
          </button>
        </div>
        {isLoading || !data ? (
          <div className="p-4 text-sm text-muted-foreground">
            {t("usage:breakdown.loading")}
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <ContextWindowBar
              used={data.lastWindowTokens ?? 0}
              total={data.contextWindow}
              model={data.lastModel}
              labels={{
                window: t("usage:breakdown.window"),
                model: t("usage:breakdown.model"),
                noLive: t("usage:breakdown.noLive"),
              }}
            />
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("usage:breakdown.composition")}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("usage:breakdown.compositionHelp", {
                  chars: formatNumber(data.totalChars),
                  tokens: formatTokens(data.totalEstTokens),
                })}
              </div>
            </div>
            <div className="space-y-1">
              {data.blocks.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  {t("usage:breakdown.empty")}
                </div>
              ) : (
                data.blocks.map((b) => (
                  <div
                    key={b.source}
                    className="flex items-baseline justify-between gap-3 text-sm py-1 border-b border-border last:border-b-0"
                  >
                    <div className="truncate">{b.title}</div>
                    <div className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {formatTokens(b.estTokens)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ContextWindowBar({
  used,
  total,
  model,
  labels,
}: {
  used: number;
  total: number | null;
  model: string | null;
  labels: { window: string; model: string; noLive: string };
}) {
  if (used === 0 && total === null) {
    return (
      <div className="text-sm text-muted-foreground">{labels.noLive}</div>
    );
  }
  const pct = total && total > 0 ? Math.min(100, Math.round((used / total) * 100)) : null;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs text-muted-foreground">
        <div>{labels.window}</div>
        {model && (
          <div className="truncate ml-2">
            {labels.model}: {model}
          </div>
        )}
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        {pct !== null && (
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        {formatTokens(used)}
        {total ? ` / ${formatTokens(total)}` : ""}
        {pct !== null ? ` (${pct}%)` : ""}
      </div>
    </div>
  );
}
