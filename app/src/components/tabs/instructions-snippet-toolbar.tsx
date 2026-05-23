import { useTranslation } from "react-i18next";
import { Button } from "@squad/core";
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
    <div className="flex gap-1.5 flex-wrap px-1 py-1 border-b border-border">
      {snippets.map((snippet) => (
        <Button
          key={snippet.id}
          type="button"
          variant="outline"
          size="xs"
          className="text-muted-foreground hover:text-foreground font-normal"
          onClick={() => onInsert(snippet.text)}
        >
          {labelMap[snippet.labelKey] ?? snippet.labelKey}
        </Button>
      ))}
    </div>
  );
}
