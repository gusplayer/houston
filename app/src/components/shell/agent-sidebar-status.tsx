import type { CSSProperties } from "react";
import { Badge, SquadAvatar, cn, resolveAgentColor } from "@squad/core";

interface AgentSidebarIconProps {
  color?: string;
  running: boolean;
  runningLabel: string;
  /** Fine-grained PTY status for multi-state indicator.
   * "running" = Claude actively generating (spinning glow).
   * "waiting" = REPL idle, waiting for input (yellow pulse).
   * undefined = no indicator override; falls back to `running` for
   * activity-based glow. */
  ptyStatus?: "running" | "waiting";
}

export function AgentSidebarIcon({
  color,
  running,
  runningLabel,
  ptyStatus,
}: AgentSidebarIconProps) {
  const avatar = (
    <SquadAvatar color={resolveAgentColor(color)} diameter={20} />
  );

  if (ptyStatus === "waiting") {
    return (
      <span
        className="size-6 shrink-0 rounded-full flex items-center justify-center pty-waiting-pulse"
        title={runningLabel}
      >
        {avatar}
      </span>
    );
  }

  if (!running) return avatar;

  return (
    <span
      className={cn(
        "size-6 shrink-0 rounded-full flex items-center justify-center",
        "card-running-glow",
      )}
      style={{ "--glow-bg": "var(--color-sidebar)" } as CSSProperties}
      title={runningLabel}
    >
      {avatar}
    </span>
  );
}

interface NeedsYouChipProps {
  count: number;
  label: string;
}

export function NeedsYouChip({ count, label }: NeedsYouChipProps) {
  if (count <= 0) return null;

  return (
    <Badge
      variant="outline"
      aria-label={label}
      title={label}
      className="h-5 min-w-7 bg-background/90 px-2 text-[11px] font-semibold leading-none text-foreground/80"
    >
      {count > 99 ? "99+" : count}
    </Badge>
  );
}
