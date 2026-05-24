import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../../stores/ui";
import { useRules, useSaveRules } from "../../hooks/queries";
import type { SaveState } from "./instructions-agent-editor";
import { InstructionsEditor } from "./instructions-editor";

export function RulesContent({ agentPath }: { agentPath?: string }) {
  const { t } = useTranslation("agents");
  const addToast = useUIStore((s) => s.addToast);
  const { data: rules, isLoading } = useRules(agentPath);
  const saveRules = useSaveRules(agentPath);
  const [value, setValue] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    if (rules !== undefined) setValue(rules);
  }, [rules]);

  const handleBlur = async () => {
    if (!agentPath || rules === undefined || value === rules) return;
    setSaveState("saving");
    try {
      await saveRules.mutateAsync(value);
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 2000);
    } catch (err) {
      setSaveState("idle");
      addToast({
        title: t("instructionsSaveFailed"),
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    }
  };

  return (
    <div className="flex flex-1 flex-col min-h-0 px-6 pb-6 pt-4 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">{t("rules.helper")}</p>
        {saveState === "saving" && (
          <span className="text-xs text-muted-foreground">{t("instructions.saving")}</span>
        )}
        {(saveState === "saved" || saveState === "saved-active") && (
          <span className="text-xs text-muted-foreground">{t("instructions.saved")}</span>
        )}
      </div>
      <InstructionsEditor
        value={isLoading ? "" : value}
        onChange={setValue}
        onBlur={handleBlur}
      />
    </div>
  );
}
