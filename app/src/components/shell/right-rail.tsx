import { useTranslation } from "react-i18next";
import { MessageCircle, Terminal, FileText } from "lucide-react";
import { cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@squad/core";

interface RightRailProps {
  viewMode: string;
  hasBriefTab: boolean;
  hasActivityTab: boolean;
  onNavigate: (tab: string) => void;
  onNewTask: (() => void) | null;
}

interface RailButtonProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function RailButton({ icon, label, active, disabled, onClick }: RailButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          onClick={onClick}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
            active
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            disabled && "cursor-not-allowed opacity-40",
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
  hasBriefTab,
  hasActivityTab,
  onNavigate,
  onNewTask,
}: RightRailProps) {
  const { t } = useTranslation("shell");

  const handleChat = () => {
    if (hasActivityTab) onNavigate("activity");
    onNewTask?.();
  };

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-l border-border py-3">
        <RailButton
          icon={<MessageCircle className="size-[18px]" />}
          label={t("rightRail.chat")}
          active={viewMode === "activity"}
          onClick={handleChat}
        />
        <RailButton
          icon={<Terminal className="size-[18px]" />}
          label={t("rightRail.terminal")}
          active={false}
          onClick={handleChat}
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
