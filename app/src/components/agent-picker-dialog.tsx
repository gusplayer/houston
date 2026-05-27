import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  SquadAvatar,
  resolveAgentColor,
} from "@squad/core";
import type { Agent } from "../lib/types";
import { sortAgentsByRoleTier } from "../agents/builtin";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: Agent[];
  /** Resolves an agent's display role (e.g. "CTO", "QA Engineer"). The picker
   * uses this to show role next to the name so a first-time user can tell
   * who does what. */
  getRoleLabel?: (configId: string) => string | undefined;
  onPick: (agent: Agent) => void;
}

/**
 * Modal that asks "which agent should run this mission?" and renders one
 * card per agent. Picking an agent switches the app to that agent's board
 * view and opens the new-mission right panel — the same flow you get from
 * the per-agent New Mission button. See the dashboard wiring for that
 * sequencing (it lives there because it depends on view-mode state).
 *
 * Agents are sorted by canonical role tier so the workspace lead (CTO)
 * appears first and is marked as recommended. The sort is intentional: a
 * new user opening the picker should not have to scan an arbitrary list.
 */
export function AgentPickerDialog({ open, onOpenChange, agents, getRoleLabel, onPick }: Props) {
  const { t } = useTranslation("dashboard");
  const sortedAgents = useMemo(() => sortAgentsByRoleTier(agents), [agents]);
  const recommendedId = sortedAgents[0]?.id ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl h-[80vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
          <DialogTitle>{t("agentPicker.title")}</DialogTitle>
          <DialogDescription>{t("agentPicker.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
          <div className="flex flex-col gap-2">
            {sortedAgents.map((a) => {
              const color = resolveAgentColor(a.color);
              const roleLabel = getRoleLabel?.(a.configId);
              const isRecommended = a.id === recommendedId;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    onPick(a);
                    onOpenChange(false);
                  }}
                  className="flex items-center gap-4 rounded-2xl bg-secondary p-4 text-left transition-colors duration-200 hover:bg-accent w-full"
                >
                  <SquadAvatar color={color} diameter={48} />
                  <span className="flex flex-1 min-w-0 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {a.name}
                      </span>
                      {isRecommended ? (
                        <span className="shrink-0 rounded-full bg-primary/15 text-primary text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5">
                          {t("agentPicker.recommended")}
                        </span>
                      ) : null}
                    </span>
                    {roleLabel ? (
                      <span className="text-xs text-muted-foreground truncate">{roleLabel}</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
