import { useTranslation } from "react-i18next";
import { Terminal, SquareTerminal, FileText } from "lucide-react";
import { cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@squad/core";
import { tauriTerminal, tauriPreferences } from "../../lib/tauri";

interface RightRailProps {
  viewMode: string;
  missionPanelOpen: boolean;
  chatPanelViewMode: "chat" | "terminal";
  hasBriefTab: boolean;
  hasActivityTab: boolean;
  hasInternalTerminal: boolean;
  agentFolderPath: string | undefined;
  onNavigate: (tab: string) => void;
  onOpenInternalTerminal: () => void;
  onCloseMissionPanel: () => void;
}

interface RailButtonProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

function RailButton({ icon, label, active, onClick }: RailButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
            active
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          )}
          aria-label={label}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function RightRail({
  viewMode,
  missionPanelOpen,
  chatPanelViewMode,
  hasBriefTab,
  hasActivityTab: _hasActivityTab,
  hasInternalTerminal,
  agentFolderPath,
  onNavigate,
  onOpenInternalTerminal,
  onCloseMissionPanel,
}: RightRailProps) {
  const { t } = useTranslation("shell");

  const handleInternalTerminal = () => {
    if (missionPanelOpen && chatPanelViewMode === "terminal") {
      onCloseMissionPanel();
    } else {
      onOpenInternalTerminal();
    }
  };

  const handleExternalTerminal = async () => {
    if (!agentFolderPath) return;
    const terminalApp = await tauriPreferences.get("terminal").catch(() => undefined);
    tauriTerminal.open(agentFolderPath, undefined, terminalApp ?? undefined);
  };

  return (
    <TooltipProvider delayDuration={400}>
      {/* `data-keep-panel-open`: the right rail is a control surface for the
          dock, not "outside" of it. Without this, AIBoard's outside-click
          handler closes the panel on mousedown before the rail button's
          onClick reads the updated state — making a "minimize" click look
          like "close then reopen" and forcing a double click. */}
      <div
        data-keep-panel-open
        className="flex w-12 shrink-0 flex-col items-center gap-1 border-l border-border py-3"
      >
        {hasInternalTerminal && (
          <RailButton
            icon={<SquareTerminal className="size-[18px]" />}
            label={t("rightRail.internalTerminal")}
            active={missionPanelOpen && chatPanelViewMode === "terminal"}
            onClick={handleInternalTerminal}
          />
        )}
        <RailButton
          icon={<Terminal className="size-[18px]" />}
          label={t("rightRail.terminal")}
          active={false}
          onClick={handleExternalTerminal}
        />
        {hasBriefTab && (
          <RailButton
            icon={<FileText className="size-[18px]" />}
            label={t("rightRail.brief")}
            active={viewMode === "job-description"}
            onClick={() => onNavigate("job-description")}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
