import { SquadAvatar, resolveAgentColor } from "@squad/core";

export function AgentPanelAvatar({
  color,
  running,
}: {
  color?: string;
  running: boolean;
}) {
  return (
    <SquadAvatar
      color={resolveAgentColor(color)}
      diameter={40}
      running={running}
    />
  );
}
