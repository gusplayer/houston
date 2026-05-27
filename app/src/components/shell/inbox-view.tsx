/**
 * M6 — Inbox: workspace-wide list of activities that need the user.
 *
 * Until now the only signal a user had that an agent was waiting on
 * them was the per-agent count chip in the sidebar. That works for one
 * or two agents but breaks down for a 5+ team — you have to scan every
 * row to find the blockers, and there's no view of error states at all.
 *
 * This view aggregates every `needs_you` and `error` conversation
 * across the current workspace's agents into one chronological list.
 * Clicking an item sets the agent active, selects that conversation,
 * and switches to the activity view so the user lands in the chat
 * panel ready to respond.
 *
 * Scope intentionally bounded to the current workspace — cross-
 * workspace aggregation is a bigger lift (every workspace's agents
 * loaded eagerly) and falls under a future "global tray" feature.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Inbox, AlertCircle, MessageSquare } from "lucide-react";
import {
  Badge,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  Spinner,
  cn,
} from "@squad/core";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useAllConversations } from "../../hooks/queries";
import { AgentStateAvatar } from "../agent-state-avatar";

interface InboxItem {
  conversationId: string;
  title: string;
  status: "needs_you" | "error";
  agentId: string;
  agentName: string;
  agentPath: string;
  agentColor?: string;
  updatedAt: string;
}

export function InboxView() {
  const { t } = useTranslation(["shell", "common"]);
  const agents = useAgentStore((s) => s.agents);
  const setCurrentAgent = useAgentStore((s) => s.setCurrent);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const setSelectedConversation = useUIStore((s) => s.setSelectedConversation);

  const agentPaths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const { data: conversations, isLoading } = useAllConversations(agentPaths);

  const items: InboxItem[] = useMemo(() => {
    const agentByPath = new Map(agents.map((a) => [a.folderPath, a]));
    const out: InboxItem[] = [];
    for (const c of conversations ?? []) {
      if (c.type !== "activity") continue;
      if (c.status !== "needs_you" && c.status !== "error") continue;
      const agent = agentByPath.get(c.agent_path);
      if (!agent) continue;
      out.push({
        conversationId: c.id,
        title: c.title || t("shell:inbox.untitled"),
        status: c.status as "needs_you" | "error",
        agentId: agent.id,
        agentName: agent.name,
        agentPath: agent.folderPath,
        agentColor: agent.color,
        updatedAt: c.updated_at ?? "",
      });
    }
    // Errors first (more urgent), then by recency.
    out.sort((a, b) => {
      if (a.status !== b.status) return a.status === "error" ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    return out;
  }, [conversations, agents, t]);

  function openItem(item: InboxItem) {
    const agent = agents.find((a) => a.id === item.agentId);
    if (!agent) return;
    setSelectedConversation(item.agentPath, item.conversationId);
    setCurrentAgent(agent);
    setViewMode("activity");
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <header className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
        <Inbox className="size-4 text-muted-foreground" />
        <h1 className="text-xl font-semibold">{t("shell:inbox.title")}</h1>
        {items.length > 0 && (
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
            {items.length}
          </Badge>
        )}
      </header>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Spinner className="size-5" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="max-w-3xl mx-auto px-6 py-4 flex flex-col gap-1.5">
            {items.map((item) => (
              <InboxRow key={item.conversationId} item={item} onOpen={() => openItem(item)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function InboxRow({ item, onOpen }: { item: InboxItem; onOpen: () => void }) {
  const { t } = useTranslation("shell");
  const agentForAvatar = {
    id: item.agentId,
    name: item.agentName,
    folderPath: item.agentPath,
    color: item.agentColor,
    configId: "",
    createdAt: "",
  } as const;
  const updated = formatRelative(item.updatedAt, t);
  return (
    <li>
      <button
        onClick={onOpen}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-card text-left transition-colors hover:border-foreground/30",
        )}
      >
        <AgentStateAvatar agent={agentForAvatar} diameter={22} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium truncate">{item.title}</span>
            {item.status === "error" ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-destructive shrink-0">
                <AlertCircle className="size-3" />
                {t("inbox.statusError")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] text-amber-500 shrink-0">
                <MessageSquare className="size-3" />
                {t("inbox.statusNeedsYou")}
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {item.agentName}
            {updated && <span className="ml-1.5 text-muted-foreground/60">· {updated}</span>}
          </div>
        </div>
      </button>
    </li>
  );
}

function EmptyState() {
  const { t } = useTranslation("shell");
  return (
    <div className="h-full flex flex-col items-center justify-center px-6 text-center gap-3">
      <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center">
        <Inbox className="size-6 text-primary" />
      </div>
      <EmptyHeader>
        <EmptyTitle>{t("inbox.emptyTitle")}</EmptyTitle>
        <EmptyDescription>{t("inbox.emptyDescription")}</EmptyDescription>
      </EmptyHeader>
    </div>
  );
}

/** Tiny relative-time formatter — keeps the inbox compact without
 * pulling a heavy date library. Returns an empty string for missing
 * timestamps so the row just hides the relative chip in that case. */
function formatRelative(iso: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (!iso) return "";
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return "";
  const seconds = Math.floor((Date.now() - d) / 1000);
  if (seconds < 60) return t("inbox.relative.justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("inbox.relative.minutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("inbox.relative.hours", { count: hours });
  const days = Math.floor(hours / 24);
  return t("inbox.relative.days", { count: days });
}
