/**
 * Queue tab — the agent's filtered slice of the workspace board.
 *
 * Phase 2 introduces a single workspace board (Stories, stored at
 * `<workspace>/.squad/stories/stories.json`). The agent view no longer
 * keeps a separate kanban; it shows only the stories assigned to this
 * agent, ordered so the top card is the next thing to pick up.
 *
 * The Queue is read-only here — story creation, deletion, and status
 * changes live on the workspace board (Sprints tab / Dashboard). Clicking
 * a queued card jumps to the workspace board with the story preselected.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  Badge,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  Spinner,
} from "@squad/core";
import type { Story, StoryPriority, StoryStatus } from "@squad/engine-client";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useStories } from "../../hooks/queries";
import { useUIStore } from "../../stores/ui";
import type { TabProps } from "../../lib/types";

const PRIORITY_ORDER: Record<StoryPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const ACTIVE_STATUSES: StoryStatus[] = [
  "todo",
  "running",
  "needs_you",
  "in_progress",
  "in_review",
];

const STATUS_BADGE: Partial<Record<StoryStatus, string>> = {
  running: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  needs_you: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  in_progress: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  in_review: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  todo: "bg-muted text-muted-foreground",
};

function sortStories(stories: Story[]): Story[] {
  return [...stories].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority ?? "medium"] ?? 2;
    const pb = PRIORITY_ORDER[b.priority ?? "medium"] ?? 2;
    if (pa !== pb) return pa - pb;
    return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
  });
}

export default function QueueTab({ agent }: TabProps) {
  const { t } = useTranslation(["board", "dashboard"]);
  const workspace = useWorkspaceStore((s) => s.current);
  const path = workspace?.path;
  const { data: stories, isLoading } = useStories(path);
  const setViewMode = useUIStore((s) => s.setViewMode);

  const queue = useMemo(() => {
    if (!stories) return [];
    return sortStories(
      stories.filter(
        (s) =>
          s.assignedAgentId === agent.id &&
          ACTIVE_STATUSES.includes(s.status),
      ),
    );
  }, [stories, agent.id]);

  const handleOpenBoard = () => {
    setViewMode("dashboard");
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <EmptyHeader>
          <EmptyTitle>{t("dashboard:queue.emptyTitle")}</EmptyTitle>
          <EmptyDescription>{t("dashboard:queue.emptyDescription")}</EmptyDescription>
        </EmptyHeader>
        <button
          type="button"
          onClick={handleOpenBoard}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          {t("dashboard:queue.openBoardCta")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 py-3">
        <p className="text-sm text-muted-foreground">
          {t("dashboard:queue.subtitle", { count: queue.length })}
        </p>
      </div>
      <ol className="flex-1 overflow-y-auto p-4">
        {queue.map((story, idx) => {
          const live = story.status === "running";
          const needsYou = story.status === "needs_you";
          const badgeClass =
            STATUS_BADGE[story.status] ?? "bg-muted text-muted-foreground";
          return (
            <li
              key={story.id}
              className="mb-2 flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <span className="mt-0.5 w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {idx + 1}.
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {story.title}
                  </span>
                  {live && (
                    <Loader2 className="size-3 shrink-0 animate-spin text-blue-500" />
                  )}
                </div>
                {story.description && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {story.description}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className={badgeClass}>
                    {t(`board:status.${story.status}` as const)}
                  </Badge>
                  {story.phase && (
                    <Badge variant="outline" className="text-[10px]">
                      {story.phase}
                    </Badge>
                  )}
                  {story.priority && (
                    <Badge variant="outline" className="text-[10px]">
                      {story.priority}
                    </Badge>
                  )}
                  {needsYou && (
                    <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      {t("dashboard:queue.needsYou")}
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
