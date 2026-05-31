/**
 * Terminal tab — the agent's first-class terminal surface (Phase 7).
 *
 * Renders the existing TerminalDock with no-op chrome callbacks so it
 * fills the agent tab area instead of the right rail. The PTY, context
 * bar, and toolbar are unchanged; only the surrounding chrome differs.
 */
import { useUIStore } from "../../stores/ui";
import { TerminalDock } from "../shell/terminal-dock";
import type { TabProps } from "../../lib/types";

export default function TerminalTab({ agent }: TabProps) {
  const setViewMode = useUIStore((s) => s.setViewMode);

  return (
    <div className="flex h-full flex-col">
      <TerminalDock
        agent={{
          id: agent.id,
          name: agent.name,
          folderPath: agent.folderPath,
        }}
        onHide={() => {
          /* tab-mode: no-op; the terminal stays in view */
        }}
        onOpenUsage={() => setViewMode("settings")}
      />
    </div>
  );
}
