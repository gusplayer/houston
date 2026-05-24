import { useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@uiw/react-codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import ReactMarkdown from "react-markdown";
import { cn } from "@squad/core";
import { useTranslation } from "react-i18next";

type EditorMode = "edit" | "preview";

interface InstructionsEditorProps {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  editorRef?: React.RefObject<ReactCodeMirrorRef | null>;
}

export function InstructionsEditor({
  value,
  onChange,
  onBlur,
  editorRef,
}: InstructionsEditorProps) {
  const { t } = useTranslation("agents");
  const [mode, setMode] = useState<EditorMode>("edit");

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex justify-end mb-2">
        <div className="flex items-center rounded-md border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={cn(
              "px-3 py-1 text-[11px] font-medium transition-colors",
              mode === "edit"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("instructions.editMode")}
          </button>
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={cn(
              "px-3 py-1 text-[11px] font-medium transition-colors",
              mode === "preview"
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("instructions.previewMode")}
          </button>
        </div>
      </div>

      {mode === "edit" ? (
        <div
          className="flex-1 min-h-0 rounded-lg overflow-hidden border border-black/[0.04] cm-squad-wrapper"
          onBlur={onBlur}
        >
          <CodeMirror
            ref={editorRef}
            value={value}
            onChange={onChange}
            extensions={[markdown(), EditorView.lineWrapping]}
            theme={oneDark}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: true,
            }}
            height="100%"
            style={{ flex: 1, minHeight: 0, overflow: "auto" }}
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto rounded-lg bg-background border border-black/[0.04] px-4 py-3">
          {value.trim() ? (
            <div className="prose prose-sm prose-stone max-w-none text-foreground dark:prose-invert">
              <ReactMarkdown>{value}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-muted-foreground/60 text-sm">
              {t("instructions.placeholder")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
