import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, Blend, Settings, Store, Building2, Inbox, FileText } from "lucide-react";
import { ConfirmDialog } from "@squad/core";
import { AppSidebar, WorkspaceSwitcher } from "@squad/layout";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useAgentStore } from "../../stores/agents";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useUIStore } from "../../stores/ui";
import { UpdateChecker } from "./update-checker";
import { UserMenu } from "./user-menu";
import { CreateWorkspaceDialog } from "./workspace-dialog";
import { useAgentActivitySummaries } from "./use-agent-activity-summaries";
import { buildAgentSidebarItems } from "./agent-sidebar-items";
import { sortAgentsByRoleTier } from "../../agents/builtin";

export function Sidebar({ children }: { children: ReactNode }) {
  const { t } = useTranslation(["shell", "common"]);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrent);

  const agents = useAgentStore((s) => s.agents);
  const currentAgent = useAgentStore((s) => s.current);
  const setCurrentAgent = useAgentStore((s) => s.setCurrent);
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const renameAgent = useAgentStore((s) => s.rename);
  const deleteAgent = useAgentStore((s) => s.delete);
  const updateAgentColor = useAgentStore((s) => s.updateColor);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [createWsOpen, setCreateWsOpen] = useState(false);

  const getById = useAgentCatalogStore((s) => s.getById);
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const setDialogOpen = useUIStore((s) => s.setCreateAgentDialogOpen);

  // Canonical role-tier order: CTO first, then Architect, PM, Code Reviewer,
  // QA, specialists, dev tools. Predictable across navigations and matches
  // how the team is introduced in the docs.
  const sorted = sortAgentsByRoleTier(agents);
  const activitySummaries = useAgentActivitySummaries(agents);

  const items = buildAgentSidebarItems({
    agents: sorted,
    summaries: activitySummaries,
    runningLabel: (count) =>
      t("shell:sidebar.runningCount", { count }),
    needsYouLabel: (count) =>
      t("shell:sidebar.needsYouCount", { count }),
    onChangeColor: (agentId, color) => {
      void handleChangeColor(agentId, color);
    },
    getConfig: (configId) => getById(configId)?.config,
  });
  const isTopLevel =
    viewMode === "dashboard" ||
    viewMode === "store" ||
    viewMode === "connections" ||
    viewMode === "specs" ||
    viewMode === "settings" ||
    viewMode === "workspace" ||
    viewMode === "inbox";

  const inboxCount = useMemo(
    () =>
      Object.values(activitySummaries).reduce(
        (acc, s) => acc + s.needsYouCount,
        0,
      ),
    [activitySummaries],
  );

  const handleWorkspaceSwitch = async (wsId: string) => {
    if (wsId === currentWorkspace?.id) return;
    const ws = workspaces.find((s) => s.id === wsId);
    if (!ws) return;
    setCurrentWorkspace(ws);
    await loadAgents(ws.id);
  };

  const handleCreateWorkspace = () => {
    setCreateWsOpen(true);
  };


  const handleSelectAgent = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;
    setCurrentAgent(agent);
    const def = getById(agent.configId);
    const tab = def?.config.defaultTab ?? "chat";
    setViewMode(tab);
  };

  const handleRename = async (agentId: string, newName: string) => {
    if (!currentWorkspace) return;
    await renameAgent(currentWorkspace.id, agentId, newName);
  };

  async function handleChangeColor(agentId: string, color: string) {
    if (!currentWorkspace) return;
    await updateAgentColor(currentWorkspace.id, agentId, color);
  }

  const handleDelete = (agentId: string) => {
    setPendingDeleteId(agentId);
  };

  const addToast = useUIStore((s) => s.addToast);
  const confirmDelete = async () => {
    if (!currentWorkspace || !pendingDeleteId) return;
    try {
      await deleteAgent(currentWorkspace.id, pendingDeleteId);
    } catch (err) {
      addToast({
        title: t("shell:agentDelete.errorTitle"),
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    } finally {
      setPendingDeleteId(null);
    }
  };

  return (
    <>
    <ConfirmDialog
      open={pendingDeleteId !== null}
      onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
      title={t("shell:agentDelete.title")}
      description={t("shell:agentDelete.description")}
      confirmLabel={t("common:actions.delete")}
      onConfirm={confirmDelete}
    />
    <CreateWorkspaceDialog open={createWsOpen} onOpenChange={setCreateWsOpen} />
    <div className="flex h-full flex-1 min-w-0">
      <AppSidebar
        header={
          <WorkspaceSwitcher
            workspaces={workspaces}
            currentId={currentWorkspace?.id ?? null}
            currentName={currentWorkspace?.name ?? t("shell:sidebar.selectWorkspace")}
            onSwitch={handleWorkspaceSwitch}
            onCreate={handleCreateWorkspace}
          />
        }
        navItems={[
          {
            id: "dashboard",
            label: t("shell:sidebar.missionControl"),
            icon: <LayoutDashboard className="h-4 w-4" />,
            onClick: () => setViewMode("dashboard"),
            dataAttrs: { "data-tour-target": "nav-dashboard" },
          },
          {
            id: "inbox",
            label: t("shell:sidebar.inbox"),
            icon: <Inbox className="h-4 w-4" />,
            onClick: () => setViewMode("inbox"),
            trailing:
              inboxCount > 0 ? (
                <span className="rounded-full bg-amber-500 text-[10px] font-medium text-white px-1.5 leading-4 min-w-4 text-center">
                  {inboxCount}
                </span>
              ) : undefined,
          },
          {
            id: "store",
            label: t("shell:sidebar.store"),
            icon: <Store className="h-4 w-4" />,
            onClick: () => setViewMode("store"),
            dataAttrs: { "data-tour-target": "nav-store" },
          },
          {
            id: "workspace",
            label: t("shell:sidebar.workspace"),
            icon: <Building2 className="h-4 w-4" />,
            onClick: () => setViewMode("workspace"),
          },
          {
            id: "connections",
            label: t("shell:sidebar.integrations"),
            icon: <Blend className="h-4 w-4" />,
            onClick: () => setViewMode("connections"),
            dataAttrs: { "data-tour-target": "nav-connections" },
          },
          {
            id: "specs",
            label: t("shell:sidebar.specs"),
            icon: <FileText className="h-4 w-4" />,
            onClick: () => setViewMode("specs"),
          },
          {
            id: "settings",
            label: t("shell:sidebar.settings"),
            icon: <Settings className="h-4 w-4" />,
            onClick: () => setViewMode("settings"),
          },
        ]}
        activeNavId={isTopLevel ? viewMode : undefined}
        sectionLabel={t("shell:sidebar.yourAgents")}
        items={items}
        selectedId={!isTopLevel ? currentAgent?.id ?? null : null}
        onSelect={handleSelectAgent}
        onAdd={() => setDialogOpen(true)}
        addItemDataAttrs={{ "data-tour-target": "newAgent" }}
        onRename={handleRename}
        onDelete={handleDelete}
        labels={{
          addItem: t("shell:sidebar.addAgent"),
          moreOptions: t("shell:sidebar.agentMenu"),
          renameItem: t("common:actions.rename"),
          deleteItem: t("common:actions.delete"),
        }}
        footer={
          <div className="flex flex-col">
            <UserMenu />
            <UpdateChecker />
          </div>
        }
      >
        <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col">
          {children}
        </div>
      </AppSidebar>
    </div>
    </>
  );
}
