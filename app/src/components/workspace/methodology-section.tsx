import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Spinner } from "@squad/core";
import type { TriggerMode } from "@squad/engine-client";
import {
  useMethodology,
  useUpdateMethodology,
} from "../../hooks/queries/use-methodology";
import { useUIStore } from "../../stores/ui";
import { MethodologyProjectsList } from "./methodology-projects-list";

export function MethodologySection({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation("shell");
  const addToast = useUIStore((s) => s.addToast);

  const { data: cfg, isLoading } = useMethodology(workspaceId);
  const updateCfg = useUpdateMethodology(workspaceId);

  const [enabled, setEnabled] = useState(false);
  const [triggerMode, setTriggerMode] = useState<TriggerMode>("pre-merge");
  const [targetBranch, setTargetBranch] = useState("");

  useEffect(() => {
    if (cfg) {
      setEnabled(cfg.enabled);
      setTriggerMode(cfg.triggerMode);
      setTargetBranch(cfg.targetBranch ?? "");
    }
  }, [cfg]);

  const dirty =
    !!cfg &&
    (cfg.enabled !== enabled ||
      cfg.triggerMode !== triggerMode ||
      (cfg.targetBranch ?? "") !== targetBranch.trim());

  async function handleSave() {
    try {
      await updateCfg.mutateAsync({
        enabled,
        triggerMode,
        targetBranch: targetBranch.trim() || undefined,
      });
      addToast({ title: t("workspace.methodologySaved"), variant: "success" });
    } catch (err) {
      addToast({
        title: t("workspace.methodologySaveError"),
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Spinner className="size-5" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-6">
      <p className="text-xs text-muted-foreground mb-4">
        {t("workspace.methodologyHint")}
      </p>

      <div className="flex flex-col gap-3 mb-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="size-4"
          />
          <span className="text-sm">{t("workspace.methodologyEnabled")}</span>
        </label>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">
            {t("workspace.methodologyTriggerMode")}
          </label>
          <select
            value={triggerMode}
            onChange={(e) => setTriggerMode(e.target.value as TriggerMode)}
            disabled={!enabled}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs disabled:opacity-50"
          >
            <option value="manual">
              {t("workspace.methodologyMode.manual")}
            </option>
            <option value="pre-merge">
              {t("workspace.methodologyMode.preMerge")}
            </option>
            <option value="pre-commit">
              {t("workspace.methodologyMode.preCommit")}
            </option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">
            {t("workspace.methodologyTargetBranch")}
          </label>
          <input
            value={targetBranch}
            onChange={(e) => setTargetBranch(e.target.value)}
            placeholder="main"
            disabled={!enabled}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs disabled:opacity-50"
          />
        </div>

        <div>
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={!dirty || updateCfg.isPending}
            onClick={() => void handleSave()}
          >
            {updateCfg.isPending && <Spinner className="size-3 mr-1" />}
            {t("workspace.methodologySave")}
          </Button>
        </div>
      </div>

      <MethodologyProjectsList workspaceId={workspaceId} />
    </div>
  );
}
