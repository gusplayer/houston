import { useRef } from "react";
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { useTranslation } from "react-i18next";
import { Button, cn } from "@squad/core";
import { RefreshCw } from "lucide-react";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { InstructionsEditor } from "./instructions-editor";
import { InstructionsSnippetToolbar } from "./instructions-snippet-toolbar";

export type SaveState = "idle" | "saving" | "saved" | "saved-active";

interface InstructionsAgentEditorProps {
  value: string;
  saveState: SaveState;
  agentPath?: string;
  agentId?: string;
  /** The agent's config slug (e.g. "cto-agent") — distinct from the instance UUID. Used to look up role-specific snippets. */
  agentConfigId?: string;
  restarting: boolean;
  onChange: (v: string) => void;
  onBlur: () => void;
  onRestart: () => void;
}

export function InstructionsAgentEditor({
  value,
  saveState,
  agentPath,
  agentId,
  agentConfigId,
  restarting,
  onChange,
  onBlur,
  onRestart,
}: InstructionsAgentEditorProps) {
  const { t } = useTranslation("agents");

  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const getById = useAgentCatalogStore((s) => s.getById);
  // agentConfigId is the catalog key (e.g. "cto-agent"); agentId is the instance UUID.
  const roleLabel = agentConfigId ? getById(agentConfigId)?.config.roleLabel : undefined;

  const insertSnippet = (text: string) => {
    const view = editorRef.current?.view;
    if (!view) {
      onChange(value + "\n" + text + "\n");
      return;
    }
    const { from } = view.state.selection.main;
    view.dispatch({
      changes: { from, insert: "\n" + text + "\n" },
      selection: { anchor: from + text.length + 2 },
    });
    view.focus();
  };

  const saveLabel = (() => {
    if (saveState === "saving") return t("instructions.saving");
    if (saveState === "saved") return t("instructions.saved");
    if (saveState === "saved-active") return t("instructions.savedActiveSession");
    return "";
  })();

  return (
    <div className="max-w-3xl mx-auto w-full px-6 pb-12 pt-2 flex flex-col flex-1 min-h-0">
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
      <section className="rounded-xl bg-secondary p-3 flex flex-col flex-1 min-h-0">
        <InstructionsSnippetToolbar
          roleLabel={roleLabel}
          onInsert={insertSnippet}
        />
        <InstructionsEditor
          editorRef={editorRef}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
        />
      </section>
    </div>
  );
}
