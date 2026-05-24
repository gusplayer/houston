import { useTranslation } from "react-i18next";
import { MessageCircle, Terminal, FileText } from "lucide-react";
import { cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@squad/core";
import { tauriTerminal, tauriPreferences } from "../../lib/tauri";

interface RightRailProps {
  viewMode: string;
  missionPanelOpen: boolean;
  hasBriefTab: boolean;
  hasActivityTab: boolean;
  agentFolderPath: string | undefined;
  onNavigate: (tab: string) => void;
  onNewTask: (() => void) | null;
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
  hasBriefTab,
  hasActivityTab,
  agentFolderPath,
  onNavigate,
  onNewTask,
  onCloseMissionPanel,
}: RightRailProps) {
  const { t } = useTranslation("shell");

  const handleChat = () => {
    if (missionPanelOpen) {
      onCloseMissionPanel();
    } else {
      if (hasActivityTab) onNavigate("activity");
      onNewTask?.();
    }
  };

  const handleTerminal = async () => {
    if (!agentFolderPath) return;
    const terminalApp = await tauriPreferences.get("terminal").catch(() => undefined);
    tauriTerminal.open(agentFolderPath, undefined, terminalApp ?? undefined);
  };

  const handleBrief = () => {
    onNavigate("job-description");
  };

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-l border-border py-3">
        <RailButton
          icon={<MessageCircle className="size-[18px]" />}
          label={t("rightRail.chat")}
          active={missionPanelOpen}
          onClick={handleChat}
        />
        <RailButton
          icon={<Terminal className="size-[18px]" />}
          label={t("rightRail.terminal")}
          active={false}
          onClick={handleTerminal}
        />
        {hasBriefTab && (
          <RailButton
            icon={<FileText className="size-[18px]" />}
            label={t("rightRail.brief")}
            active={viewMode === "job-description"}
            onClick={handleBrief}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
