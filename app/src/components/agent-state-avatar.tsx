import { SquadAvatar, cn, resolveAgentColor } from "@squad/core";
import { useAgentState, type AgentState } from "../hooks/use-agent-state";
import type { Agent } from "../lib/types";

interface AgentStateAvatarProps {
  agent: Agent;
  diameter?: number;
  /** Override the computed state (useful for the team-library preview). */
  state?: AgentState;
  /** G.4 extension point: a per-state image URL map. When provided AND
   * the current state has a frame, we render the image in place of the
   * helmet. Falls back to the helmet for any state without a frame so
   * partial sprite packs degrade cleanly. Real animated packs are a
   * follow-up; the slot exists so we can drop them in without
   * re-plumbing every call site. */
  spritePack?: Partial<Record<AgentState, string>>;
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
 * state. The optional `spritePack` prop is the seam for G.4: drop a
 * per-role per-state image map and it replaces the helmet for any
 * state in the pack. Anything missing falls back to the helmet, so a
 * pack with only `working` and `idle` art still works end-to-end.
 */
export function AgentStateAvatar({
  agent,
  diameter = 24,
  state,
  spritePack,
  className,
}: AgentStateAvatarProps) {
  const liveState = useAgentState(agent.folderPath);
  const effective = state ?? liveState;
  const dotColor = STATE_DOT_COLORS[effective];
  // Dot is ~30% of the avatar, capped so it stays legible at any size.
  const dotSize = Math.max(6, Math.min(12, Math.round(diameter * 0.34)));

  const sprite = spritePack?.[effective];

  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: diameter, height: diameter }}
      title={`${agent.name} · ${effective}`}
    >
      {sprite ? (
        <img
          src={sprite}
          alt={`${agent.name} ${effective}`}
          className="rounded-full object-cover"
          style={{ width: diameter, height: diameter }}
        />
      ) : (
        <SquadAvatar color={resolveAgentColor(agent.color)} diameter={diameter} />
      )}
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
