import { useTranslation } from "react-i18next";
import { Wand2 } from "lucide-react";
import { cn } from "@squad/core";
import { getSnippetsForRole } from "../../lib/instruction-snippets";

interface InstructionsSnippetToolbarProps {
  roleLabel?: string;
  onInsert: (text: string) => void;
}

export function InstructionsSnippetToolbar({
  roleLabel,
  onInsert,
}: InstructionsSnippetToolbarProps) {
  const { t } = useTranslation("agents");
  const snippets = getSnippetsForRole(roleLabel);

  if (snippets.length === 0) return null;

  const labelMap: Record<string, string> = {
    tone: t("instructions.snippets.tone"),
    never: t("instructions.snippets.never"),
    output: t("instructions.snippets.output"),
    tools: t("instructions.snippets.tools"),
    workflow: t("instructions.snippets.workflow"),
    design: t("instructions.snippets.design"),
    schedule: t("instructions.snippets.schedule"),
    approval: t("instructions.snippets.approval"),
  };

  return (
    <div className="flex items-center gap-2 px-1 py-1.5 border-b border-border mb-1">
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0 font-medium">
        <Wand2 className="size-3" />
        {t("instructions.snippets.insertLabel")}
      </span>
      <div className="flex gap-1 flex-wrap">
        {snippets.map((snippet) => (
          <button
            key={snippet.id}
            type="button"
            onClick={() => onInsert(snippet.text)}
            className={cn(
              "px-2 py-0.5 rounded-full text-[10px] border border-border/60",
              "text-muted-foreground bg-background hover:bg-accent hover:text-foreground",
              "transition-colors font-normal",
            )}
          >
            {labelMap[snippet.labelKey] ?? snippet.labelKey}
          </button>
        ))}
      </div>
    </div>
  );
}
