/**
 * RoutineSuggestionChip — inline "save as routine" nudge.
 *
 * Shown below the last assistant message when the user's last message
 * contained recurrence-intent keywords (e.g. "every day", "weekly").
 * Appears in the afterMessages slot of ChatPanel/AIBoard via
 * useAgentChatPanel.
 */
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { cn } from "@squad/core";
import type { RoutineIntent } from "../../lib/detect-routine-intent";

interface RoutineSuggestionChipProps {
  intent: RoutineIntent;
  onAccept: (intent: RoutineIntent) => void;
  onDismiss: () => void;
}

function periodKey(cron: string): string {
  if (cron === "0 * * * *") return "routineSuggestion.runHourly";
  if (cron === "0 9 * * 1-5") return "routineSuggestion.runWeekdays";
  if (/^0 9 \* \* [0-6]$/.test(cron)) return "routineSuggestion.runWeekly";
  if (cron.startsWith("0 9 1 ")) return "routineSuggestion.runMonthly";
  if (cron === "0 9 * * *") return "routineSuggestion.runDaily";
  if (/^0 9 \* \* \d/.test(cron)) return "routineSuggestion.runWeekly";
  return "routineSuggestion.runDaily";
}

export function RoutineSuggestionChip({
  intent,
  onAccept,
  onDismiss,
}: RoutineSuggestionChipProps) {
  const { t } = useTranslation("agents");

  return (
    <div
      className={cn(
        "mx-auto max-w-3xl w-full mt-2 mb-1",
        "animate-in fade-in duration-300",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg",
          "bg-accent/30 border border-border text-sm",
        )}
      >
        <span className="text-base leading-none select-none" aria-hidden>
          💡
        </span>
        <span className="flex-1 text-foreground">
          {t(periodKey(intent.suggestedCron) as Parameters<typeof t>[0])}
        </span>
        <button
          type="button"
          onClick={() => onAccept(intent)}
          className={cn(
            "shrink-0 h-6 px-2.5 rounded-full text-xs font-medium",
            "bg-primary text-primary-foreground",
            "hover:opacity-90 transition-opacity",
          )}
        >
          {t("routineSuggestion.setAsRoutine")}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("routineSuggestion.dismiss")}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
