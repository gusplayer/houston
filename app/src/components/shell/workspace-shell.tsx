import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Compass, Plus, Users } from "lucide-react";
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  ToastContainer,
  type Toast,
} from "@squad/core";
import { TabBar } from "@squad/layout";
import { resolveAgentTabs } from "../../agents/core-tabs";
import { useActivity } from "../../hooks/queries";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { AgentRenderer } from "./experience-renderer";
import { Dashboard } from "../dashboard";
import { IntegrationsView } from "../tabs/integrations-view";
import { SpecsView } from "../specs-view";
import { SettingsView } from "../settings/settings-view";
import { StorePage } from "../store/store-page";
import { Sidebar } from "./sidebar";
import { SquadLogo } from "./experience-card";
import { CreateAgentDialog } from "./create-workspace-dialog";
import { RecruitTeamDialog } from "./recruit-team-dialog";
import { TeamManifestBanner } from "./team-manifest-banner";
import { WorkspacePage } from "./workspace-page";
import { InboxView } from "./inbox-view";
import { AgentProjectChip } from "./agent-project-chip";
import { AgentUpdateBanner } from "./agent-update-banner";
import { DetailPanelProvider } from "./detail-panel-context";
import { MissionSearchInput } from "../mission-search-input";
import { RightRail } from "./right-rail";
import { UiTour } from "./ui-tour";
import { DockResizer } from "./dock-resizer";
import { cn } from "@squad/core";

// Lazy-load the terminal dock (xterm + toolbar) so the bundle is only fetched
// when the user opens the terminal.
const TerminalDock = lazy(() =>
  import("./terminal-dock").then((m) => ({ default: m.TerminalDock })),
);

interface WorkspaceShellProps {
  toasts: Toast[];
  onDismissToast: (id: string) => void;
}

export function WorkspaceShell({ toasts, onDismissToast }: WorkspaceShellProps) {
  const { t } = useTranslation(["agents", "shell", "board"]);
  const currentAgent = useAgentStore((s) => s.current);
  const getById = useAgentCatalogStore((s) => s.getById);
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const onStartMission = useUIStore((s) => s.onStartMission);
  const boardActions = useUIStore((s) => s.boardActions);
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);
  const setMissionPanelOpen = useUIStore((s) => s.setMissionPanelOpen);
  const chatPanelViewMode = useUIStore((s) => s.chatPanelViewMode);
  const setChatPanelViewMode = useUIStore((s) => s.setChatPanelViewMode);
  const dockWidth = useUIStore((s) => s.dockWidth);
  const setDockWidth = useUIStore((s) => s.setDockWidth);
  const setCreateAgentDialogOpen = useUIStore((s) => s.setCreateAgentDialogOpen);
  const setRecruitTeamDialogOpen = useUIStore((s) => s.setRecruitTeamDialogOpen);
  const agentMissionSearchQuery = useUIStore((s) =>
    currentAgent ? s.agentMissionSearchQueries[currentAgent.folderPath] ?? "" : "",
  );
  const agentMissionSearchLoading = useUIStore((s) =>
    currentAgent ? s.agentMissionSearchLoading[currentAgent.folderPath] ?? false : false,
  );
  const setAgentMissionSearchQuery = useUIStore((s) => s.setAgentMissionSearchQuery);
  const setPendingDashboardView = useUIStore((s) => s.setPendingDashboardView);
  const setSelectedConversation = useUIStore((s) => s.setSelectedConversation);
  const uiTourActive = useUIStore((s) => s.uiTourActive);
  const setUiTourActive = useUIStore((s) => s.setUiTourActive);
  const [panelContainer, setPanelContainer] = useState<HTMLDivElement | null>(null);
  const agentDef = currentAgent ? getById(currentAgent.configId) : undefined;
  const tabs = agentDef ? resolveAgentTabs(agentDef.config) : [];
  const hasActivityTab = tabs.some((tab) => tab.id === "activity");
  const { data: activities } = useActivity(currentAgent?.folderPath);
  const needsYouCount = (activities ?? []).filter((a) => a.status === "needs_you").length;
  const isAgentView =
    viewMode !== "dashboard" &&
    viewMode !== "store" &&
    viewMode !== "workspace" &&
    viewMode !== "connections" &&
    viewMode !== "settings" &&
    viewMode !== "inbox";
  const tabIds = new Set(tabs.map((tab) => tab.id));
  const firstAgentTab = agentDef?.config.defaultTab ?? tabs[0]?.id ?? "activity";
  // Map a desired tab id to one this agent actually has, falling back to its
  // default. Keeps the tour from spotlighting an absent tab on agents that
  // don't expose every built-in.
  const tabOr = (id: string) => (tabIds.has(id) ? id : firstAgentTab);

  useEffect(() => {
    if (isAgentView && tabs.length > 0 && !tabs.some((tab) => tab.id === viewMode)) {
      setViewMode(agentDef?.config.defaultTab ?? tabs[0].id);
    }
  }, [agentDef, isAgentView, setViewMode, tabs, viewMode]);

  return (
    <DetailPanelProvider value={panelContainer}>
      <div
        className={cn(
          "flex h-screen bg-background text-foreground",
          uiTourActive && "pointer-events-none [&_*]:select-none",
        )}
      >
        <Sidebar>
          <div className="flex min-w-0 flex-1 overflow-hidden">
            <main
              data-tour-target="main"
              className="flex min-w-0 flex-1 flex-col overflow-hidden"
            >
              <TeamManifestBanner />
              {viewMode === "dashboard" ? (
                <Dashboard />
              ) : viewMode === "inbox" ? (
                <InboxView />
              ) : viewMode === "workspace" ? (
                <WorkspacePage />
              ) : viewMode === "store" ? (
                <StorePage />
              ) : viewMode === "connections" ? (
                <IntegrationsView title={t("shell:sidebar.integrations")} />
              ) : viewMode === "specs" ? (
                <SpecsView />
              ) : viewMode === "settings" ? (
                <SettingsView />
              ) : currentAgent && agentDef && tabs.length > 0 && isAgentView ? (
                <>
                  <div data-tour-target="tabs">
                  <TabBar
                    title={currentAgent.name}
                    titleChip={<AgentProjectChip agentPath={currentAgent.folderPath} />}
                    tabs={tabs.map((tab) => ({
                      id: tab.id,
                      label: t(`agents:tabLabels.${tab.id}`, { defaultValue: tab.label }),
                      badge: tab.badge === "activity" ? needsYouCount : undefined,
                      disabled: tab.disabled,
                      chip: tab.chip,
                    }))}
                    activeTab={viewMode}
                    onTabChange={setViewMode}
                    actions={
                      <div data-keep-panel-open className="flex items-center gap-2">
                        {currentAgent && hasActivityTab && (
                          <MissionSearchInput
                            value={agentMissionSearchQuery}
                            isSearchingText={agentMissionSearchLoading}
                            labels={{
                              placeholder: t("board:search.placeholder"),
                              clear: t("board:search.clear"),
                              searchingText: t("board:search.searchingText"),
                            }}
                            className="relative w-[240px]"
                            onChange={(value) => {
                              setAgentMissionSearchQuery(currentAgent.folderPath, value);
                              if (viewMode !== "activity") setViewMode("activity");
                            }}
                          />
                        )}
                        <Button
                          data-tour-target="appTour"
                          variant="ghost"
                          className="rounded-full"
                          onClick={() => setUiTourActive(true)}
                        >
                          {t("shell:tabActions.startTour")}
                          <Compass className="size-4" />
                        </Button>
                        {onStartMission && (
                          <Button
                            data-tour-target="newMission"
                            onClick={() => {
                              setViewMode("activity");
                              setTimeout(() => {
                                useUIStore.getState().onStartMission?.();
                              }, 50);
                            }}
                          >
                            <SquadLogo size={16} />
                            {t("shell:tabActions.newMission")}
                          </Button>
                        )}
                        {boardActions.map((action) => (
                          <Button
                            key={action.id}
                            variant="secondary"
                            onClick={() => {
                              setViewMode("activity");
                              setTimeout(() => action.onClick(), 50);
                            }}
                          >
                            {action.label}
                          </Button>
                        ))}
                      </div>
                    }
                  />
                  </div>
                  <main className="min-h-0 flex-1 overflow-hidden">
                    <AgentRenderer
                      agentDef={agentDef}
                      agent={currentAgent}
                      tabs={tabs}
                      activeTabId={viewMode}
                    />
                  </main>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center">
                  <Empty className="border-0">
                    <EmptyHeader>
                      <EmptyTitle>{t("agents:empty.title")}</EmptyTitle>
                      <EmptyDescription>{t("agents:empty.description")}</EmptyDescription>
                    </EmptyHeader>
                    <div className="mt-4 flex items-center gap-2">
                      <Button
                        className="rounded-full"
                        onClick={() => setRecruitTeamDialogOpen(true)}
                      >
                        <Users className="h-4 w-4" />
                        {t("shell:recruit.entryAction")}
                      </Button>
                      <Button
                        variant="secondary"
                        className="rounded-full"
                        onClick={() => setCreateAgentDialogOpen(true)}
                      >
                        <Plus className="h-4 w-4" />
                        {t("shell:newAgent.dialogTitle")}
                      </Button>
                    </div>
                  </Empty>
                </div>
              )}
            </main>
            {/* Right dock: shows exactly ONE surface at a time — the terminal
                (terminal mode) or the AIBoard chat panel (chat mode). The chat
                portal target is ALWAYS mounted (just hidden in terminal mode)
                so AIBoard always portals into it and never falls back to its
                inline SplitView — that fallback was what rendered a second
                panel next to the terminal. DockResizer sits on the LEFT edge
                so dragging it leftwards grows the dock. */}
            {missionPanelOpen ? (
              <>
                <DockResizer width={dockWidth} onWidthChange={setDockWidth} />
                <div
                  // Part of the panel's interaction surface: clicks in the
                  // terminal must not trip AIBoard's outside-click close for
                  // the chat panel mounted (hidden) in the same dock.
                  data-keep-panel-open
                  className="h-full overflow-hidden border-l border-border shrink-0"
                  style={{ width: `${dockWidth}px`, minWidth: 360 }}
                >
                  {chatPanelViewMode === "terminal" && currentAgent ? (
                    <Suspense
                      fallback={
                        <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                          Loading terminal…
                        </div>
                      }
                    >
                      <TerminalDock
                        // Remount cleanly when switching agents so the old
                        // session's socket fully tears down before the new one
                        // connects — avoids the cross-agent reconnect race.
                        key={currentAgent.folderPath}
                        agent={{
                          id: currentAgent.id,
                          name: currentAgent.name,
                          folderPath: currentAgent.folderPath,
                        }}
                        onHide={() => {
                          setMissionPanelOpen(false);
                          // Clear the selected card so AIBoard doesn't fall
                          // back to its inline chat panel once the dock (and
                          // its portal target) unmounts.
                          setSelectedConversation(currentAgent.folderPath, null);
                        }}
                        onOpenUsage={() => {
                          setPendingDashboardView("usage");
                          setViewMode("dashboard");
                        }}
                      />
                    </Suspense>
                  ) : null}
                  <div
                    ref={setPanelContainer}
                    className={
                      chatPanelViewMode === "terminal"
                        ? "hidden"
                        : "h-full overflow-hidden"
                    }
                  />
                </div>
              </>
            ) : null}
            {isAgentView && currentAgent && (
              <RightRail
                viewMode={viewMode}
                missionPanelOpen={missionPanelOpen}
                chatPanelViewMode={chatPanelViewMode}
                hasBriefTab={tabIds.has("job-description")}
                hasActivityTab={hasActivityTab}
                hasInternalTerminal={!!currentAgent.folderPath}
                agentFolderPath={currentAgent.folderPath}
                onNavigate={setViewMode}
                onOpenInternalTerminal={() => {
                  setChatPanelViewMode("terminal");
                  setMissionPanelOpen(true);
                  if (hasActivityTab) setViewMode("activity");
                }}
                onCloseMissionPanel={() => {
                  setMissionPanelOpen(false);
                  // Same fix as the dock's Hide button: drop the selected
                  // card so AIBoard doesn't fall back to its inline chat
                  // SplitView once the dock (and its portal target) unmounts.
                  if (currentAgent) {
                    setSelectedConversation(currentAgent.folderPath, null);
                  }
                }}
              />
            )}
          </div>
        </Sidebar>
        <CreateAgentDialog />
        <RecruitTeamDialog />
        <AgentUpdateBanner />
        <ToastContainer toasts={toasts} onDismiss={onDismissToast} />
      </div>
      {uiTourActive && (
        <UiTour
          steps={[
            {
              title: t("shell:uiTour.steps.assistant.title"),
              body: t("shell:uiTour.steps.assistant.body"),
              targetSelector: "[data-tour-target='agents']",
              onEnter: () => setViewMode(firstAgentTab),
            },
            {
              title: t("shell:uiTour.steps.board.title"),
              body: t("shell:uiTour.steps.board.body"),
              targetSelector: "[data-tour-target='main']",
              onEnter: () => setViewMode(firstAgentTab),
            },
            {
              title: t("shell:uiTour.steps.newMission.title"),
              body: t("shell:uiTour.steps.newMission.body"),
              targetSelector: "[data-tour-target='newMission']",
              onEnter: () => setViewMode(firstAgentTab),
            },
            {
              title: t("shell:uiTour.steps.tabActivity.title"),
              body: t("shell:uiTour.steps.tabActivity.body"),
              targetSelector: "[data-tour-target='tab-activity']",
              onEnter: () => setViewMode(tabOr("activity")),
            },
            {
              title: t("shell:uiTour.steps.tabRoutines.title"),
              body: t("shell:uiTour.steps.tabRoutines.body"),
              targetSelector: "[data-tour-target='tab-routines']",
              onEnter: () => setViewMode(tabOr("routines")),
            },
            {
              title: t("shell:uiTour.steps.tabFiles.title"),
              body: t("shell:uiTour.steps.tabFiles.body"),
              targetSelector: "[data-tour-target='tab-files']",
              onEnter: () => setViewMode(tabOr("files")),
            },
            {
              title: t("shell:uiTour.steps.tabJobDescription.title"),
              body: t("shell:uiTour.steps.tabJobDescription.body"),
              targetSelector: "[data-tour-target='tab-job-description']",
              onEnter: () => setViewMode(tabOr("job-description")),
            },
            {
              title: t("shell:uiTour.steps.missionControl.title"),
              body: t("shell:uiTour.steps.missionControl.body"),
              targetSelector: "[data-tour-target='nav-dashboard']",
              onEnter: () => setViewMode("dashboard"),
            },
            {
              title: t("shell:uiTour.steps.integrations.title"),
              body: t("shell:uiTour.steps.integrations.body"),
              targetSelector: "[data-tour-target='nav-connections']",
              onEnter: () => setViewMode("connections"),
            },
            {
              title: t("shell:uiTour.steps.appTour.title"),
              body: t("shell:uiTour.steps.appTour.body"),
              targetSelector: "[data-tour-target='appTour']",
              onEnter: () => {
                setCreateAgentDialogOpen(false);
                setViewMode(firstAgentTab);
              },
            },
            {
              title: t("shell:uiTour.steps.newAgent.title"),
              body: t("shell:uiTour.steps.newAgent.body"),
              targetSelector: "[data-tour-target='newAgent']",
              onEnter: () => {
                setCreateAgentDialogOpen(false);
                setViewMode(firstAgentTab);
              },
            },
            {
              title: t("shell:uiTour.steps.agentStore.title"),
              body: t("shell:uiTour.steps.agentStore.body"),
              targetSelector: "[data-tour-target='agentStore']",
              spotlightPadding: 4,
              placement: "viewport-right",
              onEnter: () => setCreateAgentDialogOpen(true),
            },
            {
              title: t("shell:uiTour.steps.outro.title"),
              body: t("shell:uiTour.steps.outro.body"),
              confirmLabel: t("shell:uiTour.steps.outro.confirm"),
              onEnter: () => setCreateAgentDialogOpen(false),
            },
          ]}
          onDismiss={() => {
            setUiTourActive(false);
            setCreateAgentDialogOpen(false);
          }}
        />
      )}
    </DetailPanelProvider>
  );
}
