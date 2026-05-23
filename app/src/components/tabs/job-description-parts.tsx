import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  cn,
} from "@squad/core";
import { FileText, RefreshCw } from "lucide-react";
import { useAgentState } from "../../hooks/use-agent-state";
import { tauriChat } from "../../lib/tauri";

export type SubTab = "instructions" | "skills" | "learnings";

type SaveState = "idle" | "saving" | "saved" | "saved-active";

export function InstructionsContent({
  content,
  onSave,
  agentPath,
  agentId,
}: {
  content: string;
  onSave: (content: string) => Promise<unknown>;
  agentPath?: string;
  agentId?: string;
}) {
  const { t } = useTranslation("agents");
  const [value, setValue] = useState(content);
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<SaveState>("idle");
  const [restarting, setRestarting] = useState(false);

  const agentState = useAgentState(agentPath);
  const isSessionActive = agentState === "working";

  useEffect(() => {
    setValue(content);
  }, [content]);

  const textareaRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      if (el && editing) el.focus();
    },
    [editing],
  );

  const handleBlur = async () => {
    if (value === content) return;
    setState("saving");
    await onSave(value);
    setState(isSessionActive ? "saved-active" : "saved");
    if (!isSessionActive) {
      window.setTimeout(() => setState("idle"), 2000);
    }
  };

  const handleRestart = async () => {
    if (!agentPath || !agentId) return;
    setRestarting(true);
    const sessionKey = `chat-${agentId}`;
    await tauriChat.stop(agentPath, sessionKey).catch(() => {});
    setRestarting(false);
    setState("saved");
    window.setTimeout(() => setState("idle"), 2000);
  };

  if (!value.trim() && !editing) {
    return (
      <div className="mx-auto max-w-md flex flex-col items-center gap-6 text-center pt-24 px-6">
        <EmptyHeader>
          <EmptyTitle>{t("instructions.emptyTitle")}</EmptyTitle>
          <EmptyDescription>{t("instructions.emptyDescription")}</EmptyDescription>
        </EmptyHeader>
        <Button onClick={() => setEditing(true)}>
          <FileText className="size-4" />
          {t("instructions.writeButton")}
        </Button>
      </div>
    );
  }

  const saveLabel = (() => {
    if (state === "saving") return t("instructions.saving");
    if (state === "saved") return t("instructions.saved");
    if (state === "saved-active") return t("instructions.savedActiveSession");
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
              state === "idle" ? "opacity-0" : "opacity-100 text-muted-foreground",
            )}
            aria-live="polite"
          >
            {saveLabel}
          </span>
          {state === "saved-active" && agentPath && agentId && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px] shrink-0"
              onClick={handleRestart}
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
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlur}
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
