/**
 * FilesEmptyState — role-aware empty state for the Files tab.
 *
 * Shows a role-specific description and typical file extension badges
 * instead of the generic "No files yet" copy.
 *
 * Lives in app/ (not ui/) because it reads from the agent catalog store.
 */
import { useTranslation } from "react-i18next";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useAgentRoleFileHints } from "../../hooks/use-agent-role-profile";
import type { Agent } from "../../lib/types";

interface FilesEmptyStateProps {
  agent: Agent;
}

export function FilesEmptyState({ agent }: FilesEmptyStateProps) {
  const { t } = useTranslation("agents");
  const getById = useAgentCatalogStore((s) => s.getById);
  const roleLabel = getById(agent.configId)?.config.roleLabel;
  const hints = useAgentRoleFileHints(roleLabel);

  return (
    <div className="space-y-4 text-center max-w-md">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("files.emptyTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">{hints.description}</p>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <span className="text-xs text-muted-foreground">
          {t("files.roleHintLabel")}
        </span>
        <div className="flex flex-wrap justify-center gap-1.5">
          {hints.extensions.map((ext) => (
            <span
              key={ext}
              className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              {ext}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
