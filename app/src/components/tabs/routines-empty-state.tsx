/**
 * RoutinesEmptyState — role-aware empty state for the Routines tab.
 *
 * Shows 3 clickable example routine cards tailored to the agent's role.
 * Clicking a card pre-fills the routine editor with the example's name,
 * prompt, and cron schedule.
 *
 * Lives in app/ (not ui/) because it reads from the agent catalog store.
 */
import { useTranslation } from "react-i18next";
import { Clock, Plus } from "lucide-react";
import { Button, EmptyHeader, EmptyTitle, EmptyDescription } from "@squad/core";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import {
  useAgentRoleRoutines,
  type ExampleRoutine,
} from "../../hooks/use-agent-role-profile";
import type { RoutineFormData } from "@squad/routines";
import type { Agent } from "../../lib/types";

interface RoutinesEmptyStateProps {
  agent: Agent;
  onCreate: () => void;
  onPrefill: (form: Partial<RoutineFormData>) => void;
}

export function RoutinesEmptyState({
  agent,
  onCreate,
  onPrefill,
}: RoutinesEmptyStateProps) {
  const { t } = useTranslation("routines");
  const getById = useAgentCatalogStore((s) => s.getById);
  const roleLabel = getById(agent.configId)?.config.roleLabel;
  const examples = useAgentRoleRoutines(roleLabel);

  function handleExampleClick(example: ExampleRoutine) {
    onPrefill({
      name: example.name,
      prompt: example.prompt,
      schedule: example.cron,
      description: "",
      suppress_when_silent: true,
      timezone: null,
    });
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center w-full">
      <EmptyHeader>
        <EmptyTitle>{t("grid.exampleHeading")}</EmptyTitle>
        <EmptyDescription>{t("grid.exampleSubheading")}</EmptyDescription>
      </EmptyHeader>

      <div className="flex flex-col gap-2 w-full max-w-sm">
        {examples.map((example) => (
          <button
            key={example.name}
            onClick={() => handleExampleClick(example)}
            className="group flex flex-col items-start gap-1 rounded-xl border border-border bg-secondary/50 hover:bg-secondary hover:border-primary/30 px-4 py-3 text-left transition-colors"
          >
            <span className="text-sm font-medium text-foreground leading-tight">
              {example.name}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3 shrink-0" />
              {t("grid.exampleScheduleLabel", { schedule: example.cronLabel })}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {t("grid.orCreateNew")}
        </span>
        <Button size="sm" variant="outline" onClick={onCreate}>
          <Plus className="size-3.5" />
          {t("grid.newRoutine")}
        </Button>
      </div>
    </div>
  );
}
