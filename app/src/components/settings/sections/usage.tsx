import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Zap } from "lucide-react";
import { Badge, Button } from "@houston-ai/core";
import { useWorkspaceStore } from "../../../stores/workspaces";
import { useHoustonCreditsStore } from "../../../stores/houston-credits";
import { HOUSTON_CREDITS_INFO, FREE_CREDITS_LIMIT, LOW_CREDITS_THRESHOLD } from "../../../lib/providers";
import { HoustonCreditsTopUpDialog } from "../../houston-credits-topup-dialog";

export function UsageSection() {
  const { t } = useTranslation(["settings", "providers"]);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const balance = useHoustonCreditsStore((s) => s.balance);

  if (!currentWorkspace) return null;

  const usingCredits = currentWorkspace.provider === HOUSTON_CREDITS_INFO.id;

  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">{t("settings:usage.title")}</h2>
      <p className="text-sm text-muted-foreground mb-6">{t("settings:usage.subtitle")}</p>

      {usingCredits ? (
        <CreditsUsageCard
          balance={balance}
          onTopUp={() => setTopUpOpen(true)}
        />
      ) : (
        <OwnProviderCard provider={currentWorkspace.provider ?? ""} />
      )}

      <HoustonCreditsTopUpDialog open={topUpOpen} onOpenChange={setTopUpOpen} />
    </section>
  );
}

function CreditsUsageCard({
  balance,
  onTopUp,
}: {
  balance: number | null;
  onTopUp: () => void;
}) {
  const { t } = useTranslation(["settings", "providers"]);

  const total = FREE_CREDITS_LIMIT;
  const remaining = balance ?? total;
  const used = total - remaining;
  const pct = Math.min(100, (used / total) * 100);
  const isLow = remaining <= LOW_CREDITS_THRESHOLD;
  const isEmpty = remaining <= 0;

  const barColor = isEmpty
    ? "bg-destructive"
    : isLow
      ? "bg-amber-500"
      : "bg-foreground";

  return (
    <div className="flex flex-col gap-4">
      {/* Plan card */}
      <div className="rounded-xl border border-black/5 bg-background p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
              <Zap className="size-4 text-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">{HOUSTON_CREDITS_INFO.name}</p>
              <p className="text-xs text-muted-foreground">{t("providers:credits.subtitle")}</p>
            </div>
          </div>
          <Badge variant="secondary" className="text-xs font-normal">
            {t("providers:credits.badge")}
          </Badge>
        </div>

        {/* Progress bar */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("settings:usage.credits.used", { used, total })}</span>
            <span
              className={
                isEmpty ? "text-destructive" : isLow ? "text-amber-500" : "text-muted-foreground"
              }
            >
              {t("settings:usage.credits.remaining", { count: remaining })}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Top up row */}
      <div className="flex items-center justify-between rounded-xl border border-black/5 bg-background px-4 py-3">
        <div>
          <p className="text-sm font-medium">{t("settings:usage.credits.topUpTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("settings:usage.credits.topUpHint")}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 rounded-full px-3 text-xs shrink-0"
          onClick={onTopUp}
        >
          {t("providers:credits.topUp")}
        </Button>
      </div>
    </div>
  );
}

function OwnProviderCard({ provider }: { provider: string }) {
  const { t } = useTranslation("settings");

  const providerName =
    provider === "anthropic" ? "Anthropic" :
    provider === "openai" ? "OpenAI" :
    provider;

  return (
    <div className="rounded-xl border border-black/5 bg-background px-4 py-5">
      <p className="text-sm font-medium mb-1">
        {t("settings:usage.ownProvider.title", { provider: providerName })}
      </p>
      <p className="text-sm text-muted-foreground">
        {t("settings:usage.ownProvider.body")}
      </p>
    </div>
  );
}
