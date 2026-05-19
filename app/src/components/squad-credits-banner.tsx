import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Zap } from "lucide-react";
import { Button, cn } from "@squad/core";
import { useSquadCreditsStore } from "../stores/squad-credits";
import { SquadCreditsTopUpDialog } from "./squad-credits-topup-dialog";
import { LOW_CREDITS_THRESHOLD } from "../lib/providers";
import { useWorkspaceStore } from "../stores/workspaces";

export function SquadCreditsBanner() {
  const { t } = useTranslation("providers");
  const [topUpOpen, setTopUpOpen] = useState(false);
  const balance = useSquadCreditsStore((s) => s.balance);
  const workspace = useWorkspaceStore((s) => s.current);

  if (workspace?.provider !== "squad-credits") return null;
  if (balance === null || balance > 0) return null;

  return (
    <>
      <div
        className="flex items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm"
      >
        <div className="flex items-center gap-2">
          <Zap className="size-4 shrink-0 text-destructive" />
          <span className="text-xs text-destructive">{t("outOfCredits.body")}</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 rounded-full px-3 text-xs shrink-0"
          onClick={() => setTopUpOpen(true)}
        >
          {t("credits.topUp")}
        </Button>
      </div>

      <SquadCreditsTopUpDialog open={topUpOpen} onOpenChange={setTopUpOpen} />
    </>
  );
}

/** Credits balance pill shown in the chat footer. */
export function SquadCreditsFooterPill({ className }: { className?: string }) {
  const { t } = useTranslation("providers");
  const [topUpOpen, setTopUpOpen] = useState(false);
  const balance = useSquadCreditsStore((s) => s.balance);
  const workspace = useWorkspaceStore((s) => s.current);

  if (workspace?.provider !== "squad-credits" || balance === null) return null;

  const low = balance <= LOW_CREDITS_THRESHOLD;

  return (
    <>
      <button
        type="button"
        onClick={() => setTopUpOpen(true)}
        className={cn(
          "inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-medium transition-colors shrink-0",
          low
            ? "text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
            : "text-muted-foreground hover:text-foreground hover:bg-accent",
          className,
        )}
      >
        <Zap className="size-3" />
        {t("credits.lowWarning", { count: balance })}
      </button>

      <SquadCreditsTopUpDialog open={topUpOpen} onOpenChange={setTopUpOpen} />
    </>
  );
}
