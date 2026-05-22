import { SquadAvatar, cn, resolveAgentColor } from "@squad/core";
import { useAgentState, type AgentState } from "../hooks/use-agent-state";
import type { Agent } from "../lib/types";

interface AgentStateAvatarProps {
  agent: Agent;
  diameter?: number;
  /** Override the computed state (useful for the team-library preview). */
  state?: AgentState;
  className?: string;
}

const STATE_DOT_COLORS: Record<AgentState, string | null> = {
  working: "bg-blue-500 animate-pulse",
  needs_you: "bg-amber-500",
  error: "bg-red-500",
  done: "bg-emerald-500",
  idle: null, // no dot when idle keeps the UI calm
};

/**
 * Agent avatar with a live status dot — the visual primitive for the
 * team metaphor: each agent shows what it's doing right now.
 *
 * Wraps the existing SquadAvatar (helmet) and overlays a small Discord-
 * style dot in the bottom-right corner based on the agent's computed
 * state. Built so we can later swap the helmet for a per-role sprite
 * (G.1 team library) without changing the state machine.
 */
export function AgentStateAvatar({
  agent,
  diameter = 24,
  state,
  className,
}: AgentStateAvatarProps) {
  const liveState = useAgentState(agent.folderPath);
  const effective = state ?? liveState;
  const dotColor = STATE_DOT_COLORS[effective];
  // Dot is ~30% of the avatar, capped so it stays legible at any size.
  const dotSize = Math.max(6, Math.min(12, Math.round(diameter * 0.34)));

  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: diameter, height: diameter }}
      title={`${agent.name} · ${effective}`}
    >
      <SquadAvatar color={resolveAgentColor(agent.color)} diameter={diameter} />
      {dotColor && (
        <span
          className={cn(
            "absolute rounded-full ring-2 ring-background",
            dotColor,
          )}
          style={{
            width: dotSize,
            height: dotSize,
            right: -1,
            bottom: -1,
          }}
        />
      )}
    </span>
  );
}
