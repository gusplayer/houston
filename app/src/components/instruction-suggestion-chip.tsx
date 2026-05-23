/**
 * Inline chip shown after chat messages when the engine detects a durable
 * preference worth adding to the agent's CLAUDE.md.
 *
 * Shows:
 *  - reason (why this is suggested)
 *  - section name and proposed lines in a green diff block
 *  - Apply / Dismiss actions
 */

import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button, cn } from "@squad/core";

export interface InstructionSuggestion {
  section_name: string;
  proposed_text: string;
  reason: string;
}

interface InstructionSuggestionChipProps {
  suggestion: InstructionSuggestion;
  onApply: () => void;
  onDismiss: () => void;
}

export function InstructionSuggestionChip({
  suggestion,
  onApply,
  onDismiss,
}: InstructionSuggestionChipProps) {
  const { t } = useTranslation("agents");

  const lines = suggestion.proposed_text
    .split("\n")
    .filter((l) => l.trim().length > 0);

  return (
    <div
      className={cn(
        "animate-in fade-in duration-300",
        "bg-accent/20 border border-border rounded-xl p-4 mt-3 text-sm",
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="font-medium text-foreground leading-snug">
          💡 {t("instructionSuggestion.title")}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5"
          aria-label={t("instructionSuggestion.dismiss")}
          title={t("instructionSuggestion.dismiss")}
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Reason */}
      <p className="text-muted-foreground text-xs leading-relaxed mb-3">
        {suggestion.reason}
      </p>

      {/* Diff block */}
      <p className="text-xs text-muted-foreground mb-1.5">
        {t("instructionSuggestion.addTo", { section: suggestion.section_name })}
      </p>
      <div className="bg-background rounded-lg p-3 font-mono text-xs space-y-0.5 mb-3">
        {lines.map((line, i) => (
          <div key={i} className="flex gap-1.5">
            <span className="text-green-500 select-none shrink-0">+</span>
            <span className="text-foreground break-all">{line}</span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 rounded-full text-xs"
          onClick={onDismiss}
        >
          {t("instructionSuggestion.dismiss")}
        </Button>
        <Button
          size="sm"
          className="h-7 rounded-full text-xs"
          onClick={onApply}
        >
          {t("instructionSuggestion.apply")}
        </Button>
      </div>
    </div>
  );
}
