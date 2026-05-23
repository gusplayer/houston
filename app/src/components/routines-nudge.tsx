import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, X } from "lucide-react";
import { useQueries } from "@tanstack/react-query";
import { Button, cn } from "@squad/core";
import { resolveAgentTabs } from "../agents/core-tabs";
import { useAgentStore } from "../stores/agents";
import { useAgentCatalogStore } from "../stores/agent-catalog";
import { useUIStore } from "../stores/ui";
import { queryKeys } from "../lib/query-keys";
import { tauriRoutines } from "../lib/tauri";

const DISMISS_KEY = "squad:routines_nudge_dismissed";

/**
 * One-time discoverability nudge shown in Mission Control when the user
 * has agents (with a Routines tab) but has created zero routines so far.
 *
 * Trigger: ≥1 non-system agent with the "routines" tab, total routines = 0,
 * and the user has not dismissed this nudge before.
 *
 * Persistence: localStorage so it never re-appears after the user clicks ✕.
 */
export function RoutinesNudge() {
  const { t } = useTranslation("dashboard");
  const agents = useAgentStore((s) => s.agents);
  const setCurrent = useAgentStore((s) => s.setCurrent);
  const getById = useAgentCatalogStore((s) => s.getById);
  const setViewMode = useUIStore((s) => s.setViewMode);

  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === "1",
  );

  // All extensionTabs-based agents have the routines core tab; legacy agents
  // (e.g. agent-creator with chat-only layout) may not — this filter handles both.
  const routineAgents = agents.filter((a) => {
    const def = getById(a.configId);
    return def ? resolveAgentTabs(def.config).some((tab) => tab.id === "routines") : false;
  });

  // Query routines for every routines-capable agent in parallel.
  // Queries are only enabled when there are candidate agents.
  const routineQueries = useQueries({
    queries: routineAgents.map((a) => ({
      queryKey: queryKeys.routines(a.folderPath),
      queryFn: () => tauriRoutines.list(a.folderPath),
      enabled: !dismissed && routineAgents.length > 0,
    })),
  });

  // Wait until every query has settled before deciding whether to show.
  const allLoaded = routineQueries.every((q) => q.isFetched);
  const totalRoutines = routineQueries.reduce(
    (sum, q) => sum + (q.data?.length ?? 0),
    0,
  );

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  function handleCta() {
    const target = routineAgents[0];
    if (!target) return;
    setCurrent(target);
    setViewMode("routines");
    dismiss();
  }

  if (dismissed) return null;
  if (routineAgents.length === 0) return null;
  if (!allLoaded) return null;
  if (totalRoutines > 0) return null;

  return (
    <div
      className={cn(
        "shrink-0 flex items-start gap-3 px-4 py-3 mx-3 mt-2 rounded-lg",
        "border border-border bg-accent/40 text-foreground",
      )}
    >
      <Clock className="size-4 shrink-0 text-muted-foreground mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug">
          {t("routinesNudge.title")}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t("routinesNudge.description")}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          className="h-7 rounded-full text-xs"
          onClick={handleCta}
        >
          {t("routinesNudge.cta")}
        </Button>
        <button
          onClick={dismiss}
          className="text-muted-foreground hover:text-foreground"
          aria-label={t("routinesNudge.dismiss")}
          title={t("routinesNudge.dismiss")}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
