import { useState, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQueries } from "@tanstack/react-query";
import type { KanbanItem } from "@squad/board";
import type { FeedItem } from "@squad/chat";
import { useFeedStore } from "../stores/feeds";
import {
  getSessionStatusKey,
  isActiveSessionStatus,
  useSessionStatusStore,
} from "../stores/session-status";
import { useAgentCatalogStore } from "../stores/agent-catalog";
import { useWorkspaceStore } from "../stores/workspaces";
import { useAllConversations, useProjects, useStories } from "../hooks/queries";
import { tauriActivity, tauriChat, tauriAttachments, tauriConfig } from "../lib/tauri";
import { buildAttachmentPrompt } from "../lib/attachment-message";
import { queryKeys } from "../lib/query-keys";
import type { Agent } from "../lib/types";
import { createElement } from "react";
import { AgentCardAvatar } from "./shell/agent-card-avatar";

// Marker embedded by the phase kanban when a mission is started from a
// story. Lives at the end of the description so the agent reads the
// substance first; we strip it for UI display and use the captured id
// to resolve the linked story title for the card tag.
const STORY_MARKER_RE = /\n*<!-- squad:story=([a-zA-Z0-9-]+) -->\n*/;

export function useMissionControl(agents: Agent[]) {
  const { t } = useTranslation("chat");
  // Mission control is cross-agent. Flatten the nested feed store into a
  // single sessionKey → items map, filtered to the agents on this view.
  const allItems = useFeedStore((s) => s.items);
  const agentPaths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const feedItems = useMemo(() => {
    const out: Record<string, FeedItem[]> = {};
    for (const ap of agentPaths) {
      const bucket = allItems[ap];
      if (!bucket) continue;
      for (const [sk, items] of Object.entries(bucket)) {
        out[sk] = items;
      }
    }
    return out;
  }, [allItems, agentPaths]);
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const sessionStatuses = useSessionStatusStore((s) => s.statuses);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const pathMapRef = useRef<Record<string, string>>({});

  const paths = useMemo(
    () => agents.map((a) => a.folderPath),
    [agents],
  );

  const { data: convos, isFetched } = useAllConversations(paths);

  const getAgentDef = useAgentCatalogStore((s) => s.getById);

  const agentColorMap = useMemo(() => {
    const m: Record<string, string | undefined> = {};
    for (const a of agents) m[a.folderPath] = a.color;
    return m;
  }, [agents]);

  const agentRoleMap = useMemo(() => {
    const m: Record<string, string | undefined> = {};
    for (const a of agents) {
      const def = getAgentDef(a.configId);
      m[a.folderPath] = def?.config.roleLabel;
    }
    return m;
  }, [agents, getAgentDef]);

  // Pull each agent's config + the workspace project list so cards can
  // surface which project the agent is bound to. Tagged on the card so
  // users see role AND project context without opening the agent.
  const workspace = useWorkspaceStore((s) => s.current);
  const workspaceId = workspace?.id;
  const workspacePath = workspace?.path;
  const { data: projects } = useProjects(workspaceId);
  // Stories live at the workspace root — used to resolve the
  // `squad:story=<id>` marker embedded in mission descriptions when a
  // mission was started from a phase-kanban story.
  const { data: stories } = useStories(workspacePath);
  const agentConfigQueries = useQueries({
    queries: agents.map((a) => ({
      queryKey: queryKeys.config(a.folderPath),
      queryFn: () => tauriConfig.read(a.folderPath),
      enabled: !!a.folderPath,
    })),
  });
  const agentProjectMap = useMemo(() => {
    const m: Record<string, string | undefined> = {};
    if (!projects) return m;
    agents.forEach((a, idx) => {
      const cfg = agentConfigQueries[idx]?.data;
      if (!cfg?.projectIds || cfg.projectIds.length === 0) return;
      const names = cfg.projectIds
        .map((pid: string) => projects.find((p) => p.id === pid)?.name)
        .filter((n): n is string => !!n);
      if (names.length > 0) m[a.folderPath] = names.join(", ");
    });
    return m;
  }, [agents, agentConfigQueries, projects]);

  const items: KanbanItem[] = useMemo(() => {
    if (!convos) return [];
    const map: Record<string, string> = {};
    const result = convos
      .filter((c) => c.type === "activity" && c.status)
      .map((c) => {
        map[c.id] = c.agent_path;
        const roleLabel = agentRoleMap[c.agent_path];
        const projectName = agentProjectMap[c.agent_path];
        // Pull a `<!-- squad:story=<id> --> ` marker out of the
        // description and resolve it to the original story title.
        const m = c.description?.match(STORY_MARKER_RE);
        const storyId = m?.[1];
        const linkedStory = storyId && stories
          ? stories.find((s) => s.id === storyId)
          : undefined;
        const cleanDescription = c.description?.replace(STORY_MARKER_RE, "").trim();
        const storyTag = linkedStory ? `↳ ${linkedStory.title}` : undefined;
        const tags = [roleLabel, projectName, storyTag].filter((s): s is string => !!s);
        return {
          id: c.id,
          title: c.title,
          description: cleanDescription,
          group: c.agent_name,
          tags: tags.length > 0 ? tags : undefined,
          icon: createElement(AgentCardAvatar, { color: agentColorMap[c.agent_path] }),
          status: c.status!,
          updatedAt: c.updated_at ?? new Date().toISOString(),
          metadata: {
            agentPath: c.agent_path,
            sessionKey: c.session_key,
            storyId: linkedStory?.id,
          },
        };
      });
    pathMapRef.current = map;
    return result;
  }, [convos, agentColorMap, agentRoleMap, agentProjectMap, stories]);

  const loadHistory = useCallback(
    async (sessionKey: string): Promise<FeedItem[]> => {
      const activityId = sessionKey.replace("activity-", "");
      const agentPath = pathMapRef.current[activityId];
      if (!agentPath) return [];
      const history = await tauriChat.loadHistory(agentPath, sessionKey);
      return history as FeedItem[];
    },
    [],
  );

  const handleDelete = useCallback(
    async (item: KanbanItem) => {
      const agentPath = pathMapRef.current[item.id];
      if (!agentPath) return;
      await tauriActivity.delete(agentPath, item.id);
      // Drop any cached attachments for this conversation. Idempotent.
      await tauriAttachments.delete(`activity-${item.id}`).catch(() => {});
      if (selectedId === item.id) setSelectedId(null);
    },
    [selectedId],
  );

  const handleApprove = useCallback(
    async (item: KanbanItem) => {
      const agentPath = pathMapRef.current[item.id];
      if (!agentPath) return;
      await tauriActivity.update(agentPath, item.id, { status: "done" });
    },
    [],
  );

  const handleRename = useCallback(
    async (item: KanbanItem, newTitle: string) => {
      const agentPath = pathMapRef.current[item.id];
      if (!agentPath) return;
      await tauriActivity.update(agentPath, item.id, { title: newTitle });
    },
    [],
  );

  const setFeed = useFeedStore((s) => s.setFeed);
  const handleHistoryLoaded = useCallback(
    (sessionKey: string, history: FeedItem[]) => {
      // Mirror board-tab's hydration: when AIBoard loads persisted chat
      // for an activity, drop the server slice into the feed store so
      // the ChatPanel renders it. Without this Mission Control would
      // open a conversation and show an empty chat (history was loaded
      // but had nowhere to land).
      const activityId = sessionKey.replace("activity-", "");
      const agentPath = pathMapRef.current[activityId];
      if (!agentPath) return;
      const current = useFeedStore.getState().items[agentPath]?.[sessionKey] ?? [];
      // Server history is authoritative for what's persisted; anything
      // currently in `current` that isn't on the server is either an
      // optimistic overlay we pushed or a WS event that landed
      // mid-load. Append those after the server slice.
      const serverIds = new Set(history.map((it) => JSON.stringify(it)));
      const tail = current.filter((it) => !serverIds.has(JSON.stringify(it)));
      setFeed(agentPath, sessionKey, [...history, ...tail]);
    },
    [setFeed],
  );

  const handleSendMessage = useCallback(
    async (sessionKey: string, text: string, files: File[]) => {
      const activityId = sessionKey.replace("activity-", "");
      const agentPath = pathMapRef.current[activityId];
      if (!agentPath) return;
      try {
        const paths = await tauriAttachments.save(`activity-${activityId}`, files);
        const prompt = buildAttachmentPrompt(text, files, paths);
        await tauriChat.send(agentPath, prompt, sessionKey);
        pushFeedItem(agentPath, sessionKey, { feed_type: "user_message", data: prompt });
        setLoading((prev) => ({ ...prev, [sessionKey]: true }));
      } catch (err) {
        setLoading((prev) => ({ ...prev, [sessionKey]: false }));
        pushFeedItem(agentPath, sessionKey, {
          feed_type: "system_message",
          data: t("errors.sessionStart", { error: String(err) }),
        });
        throw err;
      }
    },
    [pushFeedItem, t],
  );

  const handleCreate = useCallback(
    async (agentPath: string, text: string) => {
      const title = text.length > 80 ? text.slice(0, 77) + "..." : text;
      const item = await tauriActivity.create(agentPath, title, text);
      const sessionKey = `activity-${item.id}`;
      pushFeedItem(agentPath, sessionKey, { feed_type: "user_message", data: text });
      setLoading((prev) => ({ ...prev, [sessionKey]: true }));
      await tauriActivity.update(agentPath, item.id, { status: "running" });
      tauriChat.send(agentPath, text, sessionKey);
      setSelectedId(item.id);
    },
    [pushFeedItem],
  );

  const effectiveLoading = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const [sessionKey, value] of Object.entries(loading)) {
      if (!value) continue;
      const activityId = sessionKey.replace("activity-", "");
      const agentPath = pathMapRef.current[activityId];
      const status = agentPath
        ? sessionStatuses[getSessionStatusKey(agentPath, sessionKey)]
        : undefined;
      if (!status || isActiveSessionStatus(status)) {
        out[sessionKey] = true;
      }
    }
    for (const item of items) {
      const sessionKey = (item.metadata?.sessionKey as string | undefined) ?? `activity-${item.id}`;
      const agentPath = pathMapRef.current[item.id];
      const status = agentPath
        ? sessionStatuses[getSessionStatusKey(agentPath, sessionKey)]
        : undefined;
      if (item.status === "running" || isActiveSessionStatus(status)) {
        out[sessionKey] = true;
      }
    }
    return out;
  }, [items, loading, sessionStatuses]);

  return {
    items,
    selectedId,
    setSelectedId,
    loading: effectiveLoading,
    isLoaded: isFetched,
    feedItems,
    loadHistory,
    handleHistoryLoaded,
    handleDelete,
    handleApprove,
    handleRename,
    handleSendMessage,
    handleCreate,
  };
}
