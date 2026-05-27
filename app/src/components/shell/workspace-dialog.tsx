import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Spinner,
  cn,
} from "@squad/core";
import { analytics } from "../../lib/analytics";
import { tauriMethodology, tauriStore } from "../../lib/tauri";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { WorkspaceSetupFlow } from "./workspace-setup-flow";
import { createPersonalAssistantForWorkspace } from "../onboarding/create-personal-assistant";
import { hireProtectedRoster } from "../onboarding/create-protected-roster";
import {
  buildAssistantInstructions,
  defaultAssistantSetup,
} from "../onboarding/personal-assistant-artifacts";

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(["shell", "setup"]);
  const createWorkspace = useWorkspaceStore((s) => s.create);
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrent);
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const loadConfigs = useAgentCatalogStore((s) => s.loadConfigs);
  const addToast = useUIStore((s) => s.addToast);
  const [tab, setTab] = useState<"new" | "github">("new");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [enableMethodology, setEnableMethodology] = useState(true);

  /** Hire the five protected default members (Sam CTO, Steve PM, Jane Code
   * Reviewer, Jeff QA, Adam Architect). Failures are reported but never abort
   * workspace creation — the user can still hire the missing ones manually. */
  async function hireDefaultRoster(workspaceId: string) {
    const result = await hireProtectedRoster(workspaceId);
    if (result.failed.length > 0) {
      addToast({
        title: t("shell:workspaceDialog.protectedRosterPartialTitle"),
        description: t("shell:workspaceDialog.protectedRosterPartialDescription", {
          count: result.failed.length,
        }),
        variant: "info",
      });
    }
  }

  /** PUT methodology config after workspace creation. Non-blocking: failure
   * surfaces as a warning toast, but the workspace itself is already created. */
  async function applyMethodologyIfRequested(workspaceId: string) {
    if (!enableMethodology) return;
    try {
      await tauriMethodology.put(workspaceId, {
        enabled: true,
        triggerMode: "pre-merge",
      });
    } catch (err) {
      addToast({
        title: t("shell:workspaceDialog.methodologyEnableError"),
        description: err instanceof Error ? err.message : String(err),
        variant: "info",
      });
    }
  }

  const handleClose = () => {
    onOpenChange(false);
    setTab("new");
    setImporting(false);
    setImportError("");
    setImportUrl("");
  };

  const handleImportWorkspace = async () => {
    const trimmed = importUrl.trim();
    if (!trimmed) return;
    setImportError("");
    setImporting(true);
    try {
      const result = await tauriStore.installWorkspaceFromGithub(trimmed);
      await loadConfigs();
      await loadWorkspaces();
      const imported = useWorkspaceStore
        .getState()
        .workspaces.find((w) => w.id === result.workspaceId);
      if (imported) {
        setCurrentWorkspace(imported);
        await hireDefaultRoster(imported.id);
        await loadAgents(imported.id);
        await applyMethodologyIfRequested(imported.id);
      }
      analytics.track("workspace_created", { source: "github_import" });
      handleClose();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("shell:workspaceDialog.title")}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {t("shell:workspaceDialog.subtitle")}
          </p>
        </DialogHeader>
        <div className="flex gap-1 pb-2">
          {(["new", "github"] as const).map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm transition-colors",
                tab === item
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {item === "new"
                ? t("shell:workspaceDialog.tabNew")
                : t("shell:workspaceDialog.tabGithub")}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 cursor-pointer px-1 pb-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={enableMethodology}
            onChange={(e) => setEnableMethodology(e.target.checked)}
            className="size-3.5"
          />
          <span>{t("shell:workspaceDialog.enableMethodology")}</span>
        </label>
        {tab === "new" ? (
          <WorkspaceSetupFlow
            mode="dialog"
            onComplete={async (name, provider, model) => {
              const ws = await createWorkspace(name, provider, model);
              const setup = defaultAssistantSetup({
                workspaceName: name,
                assistantName: t("setup:tutorial.defaults.assistantName"),
                focus: t("setup:tutorial.defaults.focus"),
                approvalRule: t("setup:tutorial.defaults.approvalRule"),
              });
              await createPersonalAssistantForWorkspace(ws.id, {
                name: setup.assistantName,
                instructions: buildAssistantInstructions(
                  setup,
                  t("setup:tutorial.defaults.firstWorkflow"),
                ),
                provider,
                model,
              });
              await hireDefaultRoster(ws.id);
              setCurrentWorkspace(ws);
              await loadAgents(ws.id);
              await applyMethodologyIfRequested(ws.id);
              handleClose();
            }}
          />
        ) : (
          <div className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground">
              {t("shell:workspaceDialog.githubDescription")}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={importUrl}
                onChange={(e) => { setImportUrl(e.target.value); setImportError(""); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && importUrl.trim() && !importing) {
                    void handleImportWorkspace();
                  }
                }}
                placeholder={t("shell:workspaceDialog.githubPlaceholder")}
                disabled={importing}
                autoFocus
                className="h-9 flex-1 rounded-full border border-border bg-background px-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              />
              <Button
                onClick={handleImportWorkspace}
                disabled={!importUrl.trim() || importing}
                className="shrink-0 rounded-full"
              >
                {importing ? <Spinner className="size-4" /> : t("shell:workspaceDialog.githubImport")}
              </Button>
            </div>
            {importError && <p className="text-xs text-destructive">{importError}</p>}
            {importing && (
              <div className="flex flex-col items-center gap-2 py-4">
                <Spinner className="size-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {t("shell:workspaceDialog.githubImporting")}
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
