import type { RefCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button, cn } from "@squad/core";
import { RefreshCw } from "lucide-react";

export type SaveState = "idle" | "saving" | "saved" | "saved-active";

interface InstructionsAgentEditorProps {
  value: string;
  saveState: SaveState;
  agentPath?: string;
  agentId?: string;
  restarting: boolean;
  textareaRef: RefCallback<HTMLTextAreaElement>;
  onChange: (v: string) => void;
  onBlur: () => void;
  onRestart: () => void;
}

export function InstructionsAgentEditor({
  value,
  saveState,
  agentPath,
  agentId,
  restarting,
  textareaRef,
  onChange,
  onBlur,
  onRestart,
}: InstructionsAgentEditorProps) {
  const { t } = useTranslation("agents");

  const saveLabel = (() => {
    if (saveState === "saving") return t("instructions.saving");
    if (saveState === "saved") return t("instructions.saved");
    if (saveState === "saved-active") return t("instructions.savedActiveSession");
    return "";
  })();

  return (
    <div className="max-w-3xl mx-auto w-full px-6 pb-12 pt-2">
      <div className="flex items-center justify-between gap-4 mb-4">
        <p className="text-xs text-muted-foreground max-w-md">
          {t("instructions.helper")}
        </p>
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "text-[11px] tabular-nums transition-opacity duration-200 shrink-0",
              saveState === "idle" ? "opacity-0" : "opacity-100 text-muted-foreground",
            )}
            aria-live="polite"
          >
            {saveLabel}
          </span>
          {saveState === "saved-active" && agentPath && agentId && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px] shrink-0"
              onClick={onRestart}
              disabled={restarting}
            >
              <RefreshCw className={cn("size-3 mr-1", restarting && "animate-spin")} />
              {t("instructions.restartSession")}
            </Button>
          )}
        </div>
      </div>
      <section className="rounded-xl bg-secondary p-3">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={t("instructions.placeholder")}
          rows={Math.max(12, value.split("\n").length + 2)}
          className={cn(
            "w-full px-4 py-3 text-sm text-foreground leading-relaxed",
            "placeholder:text-muted-foreground/60",
            "bg-background border border-black/[0.04] rounded-lg",
            "outline-none resize-none transition-shadow duration-200",
            "focus:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
          )}
        />
      </section>
    </div>
  );
}
