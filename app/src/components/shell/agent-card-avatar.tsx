import { SquadAvatar, resolveAgentColor } from "@squad/core";

export function AgentCardAvatar({ color }: { color?: string }) {
  return <SquadAvatar color={resolveAgentColor(color)} diameter={16} />;
}
