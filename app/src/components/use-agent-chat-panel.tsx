/**
 * Per-agent chat panel hook.
 *
 * Centralises every agent-scoped concern that gets spread into AIBoard
 * so the per-agent BoardTab and the cross-agent Mission Control share
 * one implementation. Callers pass an `agent` (the conversation's
 * scope) and the hook returns ready-to-use AIBoard props:
 *
 *   - chatEmptyState      — featured-skill cards + "see more"
 *   - composerHeader      — selected Skill chip above the prompt input
 *   - footer              — model selector + "Skills" button
 *   - renderUserMessage   — decode + render skill-invocation card
 *   - tool / link helpers — file tool renderer, Composio link card
 *
 * The hook also owns the Skill submission pipeline (createMission
 * for new conversations, tauriChat.send for follow-ups) so we don't
 * duplicate the encoding + feed-push logic in two places.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { detectRoutineIntent } from "../lib/detect-routine-intent";
import type { RoutineIntent } from "../lib/detect-routine-intent";
import { RoutineSuggestionChip } from "./chat/routine-suggestion-chip";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@squad/core";
import { Play } from "lucide-react";
import {
  decodeAttachmentMessage,
  UserAttachmentMessage,
  type UserAttachmentMessageLabels,
} from "@squad/chat";

import { useFeedStore } from "../stores/feeds";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";
import { useAgentStore } from "../stores/agents";
import {
  InstructionSuggestionChip,
} from "./instruction-suggestion-chip";
import {
  useActivity,
  useConnectedToolkits,
  useConnections,
  useSkills,
} from "../hooks/queries";
import {
  tauriActivity,
  tauriAgent,
  tauriAttachments,
  tauriChat,
  tauriConfig,
  tauriShell,
  tauriWorktree,
  withAttachmentPaths,
} from "../lib/tauri";
import { createMission } from "../lib/create-mission";
import { queryKeys } from "../lib/query-keys";
import { humanizeSkillName } from "../lib/humanize-skill-name";
import { useFileToolRenderer } from "../hooks/use-file-tool-renderer";
import {
  ComposioLinkCard,
  parseComposioToolkitFromHref,
} from "./composio-link-card";
import {
  ComposioSigninCard,
  isComposioSigninHref,
} from "./composio-signin-card";
import { ChatModelSelector } from "./chat-model-selector";
import { getDefaultModel } from "../lib/providers";
import { analytics } from "../lib/analytics";
import {
  buildSkillClaudePrompt,
  decodeSkillMessage,
  encodeSkillMessage,
} from "../lib/skill-message";
import { attachmentReferences } from "../lib/attachment-message";
import { SkillCard } from "./skill-card";
import { NewMissionPickerDialog } from "./new-mission-picker-dialog";
import { UserSkillMessage } from "./user-skill-message";
import { SelectedSkillChip } from "./selected-skill-chip";
import { ProviderReconnectCard } from "./shell/provider-reconnect-card";
import { ToolRuntimeErrorCard } from "./shell/tool-runtime-error-card";
import { isToolRuntimeErrorMessage } from "./tool-runtime-feed";
import { useChatDisplayLabels } from "./use-chat-display-labels";
import { getEngine } from "../lib/engine";
import {
  filterProviderAuthFeedItems,
  isProviderAuthMessage,
  providerAuthSignalKey,
} from "./tabs/provider-auth-feed";

import type { AIBoardProps } from "@squad/board";
import type { ChatMessage, ChatPanelProps, FeedItem } from "@squad/chat";
import type { Agent, AgentDefinition, SkillSummary } from "../lib/types";

interface UseAgentChatPanelArgs {
  /** The agent the panel is currently scoped to. Null disables features. */
  agent: Agent | null;
  /** That agent's catalog definition (for agentModes etc.). */
  agentDef: AgentDefinition | null;
  /** Currently-open session key, if any. Drives Skill routing. */
  selectedSessionKey: string | null;
  /** Called with the new conversation id after a Skill's "Start". */
  onSelectSession?: (id: string) => void;
}

interface AgentChatPanelProps {
  /** Renders skill cards + "see more" when no Skill is in flight. */
  chatEmptyState: AIBoardProps["chatEmptyState"];
  /** Selected Skill chip rendered above the prompt input. */
  composerHeader: AIBoardProps["composerHeader"];
  /** Submit can run the selected Skill without extra text. */
  canSendEmpty: AIBoardProps["canSendEmpty"];
  /** Intercepts composer submit while a Skill is selected. */
  onComposerSubmit: AIBoardProps["onComposerSubmit"];
  /** Composer footer with model selector + Skills button. */
  footer: AIBoardProps["footer"];
  /** Decodes skill-invocation user messages into a card. */
  renderUserMessage: AIBoardProps["renderUserMessage"];
  /** Forwarded to AIBoard / ChatPanel for tool rendering. */
  isSpecialTool: ChatPanelProps["isSpecialTool"];
  renderToolResult: ChatPanelProps["renderToolResult"];
  processLabels: ChatPanelProps["processLabels"];
  getThinkingMessage: ChatPanelProps["getThinkingMessage"];
  terminalWsUrl: ChatPanelProps["terminalWsUrl"];
  renderTurnSummary: ChatPanelProps["renderTurnSummary"];
  renderSystemMessage: AIBoardProps["renderSystemMessage"];
  mapFeedItems: AIBoardProps["mapFeedItems"];
  afterMessages: AIBoardProps["afterMessages"];
  /** Custom Composio inline-link rendering. */
  renderLink: AIBoardProps["renderLink"];
  /** Hidden picker dialog mounted in the consumer. */
  pickerDialog: ReactNode;
  /** Effective provider/model for sending. */
  effectiveProvider: string;
  effectiveModel: string;
  /** Per-chat overrides chosen via the model selector. */
  chatProvider: string | null;
  chatModel: string | null;
}

export function useAgentChatPanel({
  agent,
  agentDef,
  selectedSessionKey,
  onSelectSession,
}: UseAgentChatPanelArgs): AgentChatPanelProps {
  const { t } = useTranslation(["board", "chat", "agents"]);
  const { processLabels, getThinkingMessage } = useChatDisplayLabels();
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);

  const path = agent?.folderPath ?? null;
  const agentModes = agentDef?.config.agents;

  // ── Workspace / agent / activity tier model resolution ─────────────────
  const workspace = useWorkspaceStore((s) => s.current);
  const wsProvider = workspace?.provider ?? "anthropic";
  const wsModel = workspace?.model ?? getDefaultModel(wsProvider);
  const [agentProvider, setAgentProvider] = useState<string | null>(null);
  const [agentModel, setAgentModel] = useState<string | null>(null);
  useEffect(() => {
    if (!path) {
      setAgentProvider(null);
      setAgentModel(null);
      return;
    }
    tauriConfig
      .read(path)
      .then((cfg) => {
        setAgentProvider((cfg.provider as string) ?? null);
        setAgentModel((cfg.model as string) ?? null);
      })
      .catch(() => {});
  }, [path]);

  const { data: activities } = useActivity(path ?? undefined);
  const selectedActivity = useMemo(() => {
    if (!selectedSessionKey || !activities) return null;
    return activities.find(
      (a) => (a.session_key ?? `activity-${a.id}`) === selectedSessionKey,
    ) ?? null;
  }, [activities, selectedSessionKey]);
  const activityProvider = selectedActivity?.provider ?? null;
  const activityModel = selectedActivity?.model ?? null;
  const selectedActivityId = selectedActivity?.id ?? null;

  const [chatProvider, setChatProvider] = useState<string | null>(null);
  const [chatModel, setChatModel] = useState<string | null>(null);
  useEffect(() => {
    setChatProvider(null);
    setChatModel(null);
  }, [selectedSessionKey]);
  const effectiveProvider = chatProvider ?? activityProvider ?? agentProvider ?? wsProvider;
  const effectiveModel = chatModel ?? activityModel ?? agentModel ?? wsModel;
  const handleModelSelect = useCallback(
    (prov: string, mod: string) => {
      setChatProvider(prov);
      setChatModel(mod);
      if (!path || !selectedActivityId) return;
      tauriActivity.update(path, selectedActivityId, {
        provider: prov,
        model: mod,
      }).catch((err) => {
        addToast({
          title: t("chat:errors.modelPersistFailed"),
          description: String(err),
          variant: "error",
        });
      });
    },
    [path, selectedActivityId, addToast, t],
  );

  // ── Instruction suggestion (self-improve CLAUDE.md) ──────────────────
  const instructionSuggestion = useUIStore((s) => s.instructionSuggestion);
  const setInstructionSuggestion = useUIStore((s) => s.setInstructionSuggestion);

  // Key used to persist dismissed suggestion hashes in localStorage.
  const DISMISSED_KEY = "squad:dismissed_suggestions";

  function getDismissedHashes(): Set<string> {
    try {
      const raw = localStorage.getItem(DISMISSED_KEY);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
    return new Set();
  }

  function addDismissedHash(hash: string): void {
    try {
      const set = getDismissedHashes();
      set.add(hash);
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
    } catch {
      /* ignore */
    }
  }

  // Track last-seen `final_result` count per (agentPath, sessionKey) so we
  // fire the suggestion check exactly once per session completion.
  const lastFinalResultCountRef = useRef<Record<string, number>>({});

  const checkSuggestion = useCallback(
    (feedItems: FeedItem[], sessionKey: string) => {
      if (!path) return;
      const finalCount = feedItems.filter(
        (f) => f.feed_type === "final_result",
      ).length;
      const cacheKey = `${path}|${sessionKey}`;
      const prev = lastFinalResultCountRef.current[cacheKey] ?? 0;
      if (finalCount === 0 || finalCount === prev) return;
      lastFinalResultCountRef.current[cacheKey] = finalCount;

      // Minimum conversation length gate.
      if (feedItems.length < 5) return;

      // Don't fire if a suggestion for this agent is already pending.
      if (instructionSuggestion?.agentPath === path) return;

      // Extract last 10 messages.
      const messages = feedItems
        .filter(
          (f): f is { feed_type: "user_message" | "assistant_text"; data: string } =>
            f.feed_type === "user_message" || f.feed_type === "assistant_text",
        )
        .slice(-10)
        .map((f) => ({
          role: (f.feed_type === "user_message" ? "user" : "assistant") as
            | "user"
            | "assistant",
          text: f.data,
        }));

      if (messages.length < 2) return;

      // Fire best-effort — never surface errors to user.
      (async () => {
        try {
          const currentClaudeMd = await tauriAgent
            .readFile(path, "CLAUDE.md")
            .catch(() => "");
          const result = await getEngine().suggestInstruction(
            path,
            messages,
            currentClaudeMd,
          );
          if (!result.suggestion) return;

          // Check dismissed hashes.
          const hash = btoa(result.suggestion.proposed_text.trim());
          if (getDismissedHashes().has(hash)) return;

          setInstructionSuggestion({ agentPath: path, suggestion: result.suggestion });
        } catch {
          /* best-effort */
        }
      })();
    },
    [path, instructionSuggestion, setInstructionSuggestion],
  );

  // Apply: insert proposed_text into the appropriate CLAUDE.md section.
  const handleApplySuggestion = useCallback(async () => {
    if (!path || !instructionSuggestion) return;
    const { suggestion } = instructionSuggestion;
    try {
      const current = await tauriAgent.readFile(path, "CLAUDE.md").catch(() => "");
      const sectionHeader = suggestion.section_name.startsWith("#")
        ? suggestion.section_name
        : `## ${suggestion.section_name}`;

      let updated: string;
      const sectionIdx = current.indexOf(sectionHeader);
      if (sectionIdx !== -1) {
        // Find end of this section (next ## heading or end of file).
        const afterHeader = sectionIdx + sectionHeader.length;
        const nextHeading = current.indexOf("\n##", afterHeader);
        const insertAt = nextHeading !== -1 ? nextHeading : current.length;
        const before = current.slice(0, insertAt).trimEnd();
        const after = current.slice(insertAt);
        updated = `${before}\n${suggestion.proposed_text}${after}`;
      } else {
        // Section not found — append at end.
        updated =
          current.trimEnd() +
          `\n\n${sectionHeader}\n${suggestion.proposed_text}`;
      }

      await tauriAgent.writeFile(path, "CLAUDE.md", updated);
      addToast({
        title: t("agents:instructionSuggestion.applied"),
        variant: "success",
      });
    } catch (err) {
      addToast({
        title: t("agents:instructionSuggestion.applied"),
        description: String(err),
        variant: "error",
      });
    }
    setInstructionSuggestion(null);
  }, [path, instructionSuggestion, setInstructionSuggestion, addToast, t]);

  const handleDismissSuggestion = useCallback(() => {
    if (!instructionSuggestion) return;
    const hash = btoa(instructionSuggestion.suggestion.proposed_text.trim());
    addDismissedHash(hash);
    setInstructionSuggestion(null);
  }, [instructionSuggestion, setInstructionSuggestion]);

  // ── Routine suggestion chip ───────────────────────────────────────────
  const setCurrent = useAgentStore((s) => s.setCurrent);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const setRoutinePrefill = useUIStore((s) => s.setRoutinePrefill);

  // Key = `${sessionKey}:${userMessageText}` — tracks which (session, message)
  // pair has been dismissed so the chip doesn't re-appear for the same message.
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(
    () => new Set(),
  );

  const handleRoutineAccept = useCallback(
    (intent: RoutineIntent) => {
      if (!agent) return;
      setRoutinePrefill({
        name: intent.suggestedName,
        prompt: intent.suggestedPrompt,
        schedule: intent.suggestedCron,
        description: "",
        suppress_when_silent: true,
        timezone: null,
      });
      setCurrent(agent);
      setViewMode("routines");
    },
    [agent, setCurrent, setViewMode, setRoutinePrefill],
  );

  // ── Composio link card support ────────────────────────────────────────
  const { data: composioStatus } = useConnections();
  const isSignedIn = composioStatus?.status === "ok";
  const { data: connectedList } = useConnectedToolkits(isSignedIn);
  const connectedSet = useMemo(
    () => new Set(connectedList ?? []),
    [connectedList],
  );
  const renderLink = useCallback(
    ({ href, onOpen }: { href: string; onOpen: () => void }) => {
      if (isComposioSigninHref(href)) {
        return <ComposioSigninCard />;
      }
      const toolkit = parseComposioToolkitFromHref(href);
      if (!toolkit) return undefined;
      return (
        <ComposioLinkCard
          toolkit={toolkit}
          isConnected={connectedSet.has(toolkit)}
          onOpen={onOpen}
        />
      );
    },
    [connectedSet],
  );

  // ── File-tool rendering (per-agent path) ──────────────────────────────
  const { isSpecialTool, renderToolResult, renderTurnSummary } =
    useFileToolRenderer(path ?? "");

  // ── Skills + selected-skill state ─────────────────────────────────────
  const { data: allSkills } = useSkills(path ?? undefined);
  const emptySkillShowcase = useMemo(() => {
    const skills = allSkills ?? [];
    const featured = skills.filter((s) => s.featured);
    return (featured.length > 0 ? featured : skills).slice(0, 3);
  }, [allSkills]);
  const moreSkillsCount = Math.max(
    0,
    (allSkills?.length ?? 0) - emptySkillShowcase.length,
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeSkill, setActiveSkill] = useState<SkillSummary | null>(null);
  // Drop selected Skill when the agent / session changes so it doesn't
  // leak across contexts.
  useEffect(() => {
    setActiveSkill(null);
  }, [path, selectedSessionKey]);

  const onSelectSessionRef = useRef(onSelectSession);
  useEffect(() => {
    onSelectSessionRef.current = onSelectSession;
  }, [onSelectSession]);

  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const attachmentLabels = useMemo<UserAttachmentMessageLabels>(
    () => ({
      attachmentCount: (count) => t("attachmentMessage.count", { count }),
    }),
    [t],
  );

  // While a Skill is selected, the regular composer still owns text
  // and attachments. This hook only wraps the submitted message with the
  // hidden Skill marker + deterministic "Use the X skill" prompt.
  const handleSkillComposerSubmit = useCallback<NonNullable<AIBoardProps["onComposerSubmit"]>>(
    async ({ sessionKey, text, files }) => {
      const skill = activeSkill;
      if (!skill || !agent || !path) return false;

      const claudePrompt = buildSkillClaudePrompt(skill, text);
      const encoded = encodeSkillMessage(skill, text, claudePrompt);
      const friendlyTitle = humanizeSkillName(skill.name);

      if (sessionKey) {
        // Mid-conversation: optimistic feed push + send, mirrors the
        // text-send pipeline.
        const scopeId = sessionKey;
        const attachmentPaths = await tauriAttachments.save(scopeId, files);
        const prompt = withAttachmentPaths(claudePrompt, attachmentPaths);
        const encodedWithAttachments = encodeSkillMessage(
          skill,
          text,
          prompt,
          attachmentReferences(files, attachmentPaths),
        );
        const mode = agentModes?.find((m) => m.id === undefined); // default mode
        await tauriChat.send(path, encodedWithAttachments, sessionKey, {
          mode: mode?.promptFile,
          providerOverride: chatProvider ?? undefined,
          modelOverride: chatModel ?? undefined,
        });
        pushFeedItem(path, sessionKey, {
          feed_type: "user_message",
          data: encodedWithAttachments,
        });
      } else {
        // New conversation: createMission with `title` override so the
        // kanban card reads "Research a company" instead of the marker.
        const agentMode = agentModes?.[0]?.id;
        const mode = agentModes?.find((m) => m.id === agentMode);
        let encodedUserMessage = encoded;

        // Honour worktree mode if the agent's config opts in. Same
        // bootstrap as BoardTab's text-send path.
        let worktreePath: string | undefined;
        try {
          const cfg = await tauriConfig.read(path);
          if (cfg.worktreeMode) {
            const slug = crypto.randomUUID().slice(0, 8);
            const wt = await tauriWorktree.create(path, slug);
            worktreePath = wt.path;
            const installCmd = cfg.installCommand as string | undefined;
            if (installCmd && worktreePath) {
              tauriShell.run(worktreePath, installCmd).catch(console.error);
            }
          }
        } catch {
          /* config may not exist yet */
        }

        const { conversationId, sessionKey } = await createMission(
          {
            id: agent.id,
            name: agent.name,
            color: agent.color,
            folderPath: path,
          },
          encoded,
          {
            agentMode,
            worktreePath,
            promptFile: mode?.promptFile,
            providerOverride: chatProvider ?? undefined,
            modelOverride: chatModel ?? undefined,
            buildPrompt: async (activityId) => {
              const paths = await tauriAttachments.save(`activity-${activityId}`, files);
              const prompt = withAttachmentPaths(claudePrompt, paths);
              encodedUserMessage = encodeSkillMessage(
                skill,
                text,
                prompt,
                attachmentReferences(files, paths),
              );
              return encodedUserMessage;
            },
            title: friendlyTitle,
          },
        );
        pushFeedItem(path, sessionKey, {
          feed_type: "user_message",
          data: encodedUserMessage,
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.activity(path) });
        analytics.track("mission_created", {
          agent_mode: agentMode ?? "default",
        });
        onSelectSessionRef.current?.(conversationId);
      }
      setActiveSkill(null);
      return true;
    },
    [
      activeSkill,
      agent,
      path,
      agentModes,
      chatProvider,
      chatModel,
      pushFeedItem,
      queryClient,
      t,
    ],
  );

  // Picking a skill from a card or the picker pins it above the regular
  // composer. The user can add text or send the Skill by itself.
  const applySkill = useCallback(
    (skill: SkillSummary) => setActiveSkill(skill),
    [],
  );

  // ── Built JSX bundles ─────────────────────────────────────────────────
  const renderUserMessage = useCallback(
    (msg: { content: string }) => {
      const invocation = decodeSkillMessage(msg.content);
      if (invocation) {
        return (
          <UserSkillMessage
            invocation={invocation}
            attachmentLabels={attachmentLabels}
          />
        );
      }
      const attachmentInvocation = decodeAttachmentMessage(msg.content);
      if (!attachmentInvocation) return undefined;
      return (
        <UserAttachmentMessage
          invocation={attachmentInvocation}
          labels={attachmentLabels}
        />
      );
    },
    [attachmentLabels],
  );
  const renderSystemMessage = useCallback(
    (msg: ChatMessage) => {
      if (isToolRuntimeErrorMessage(msg)) {
        return (
          <ToolRuntimeErrorCard
            error={msg.runtimeError}
            onRetry={async () => {
              if (!path || !selectedSessionKey) return;
              const text = t("chat:toolRuntimeError.retryPrompt");
              await tauriChat.send(path, text, selectedSessionKey, {
                providerOverride: chatProvider ?? undefined,
                modelOverride: chatModel ?? undefined,
              });
              pushFeedItem(path, selectedSessionKey, {
                feed_type: "user_message",
                data: text,
              });
            }}
          />
        );
      }
      if (isProviderAuthMessage(msg.content)) return null;
      return undefined;
    },
    [chatModel, chatProvider, path, pushFeedItem, selectedSessionKey, t],
  );
  const mapFeedItems = useCallback(
    ({ items }: { sessionKey: string; items: FeedItem[] }) =>
      filterProviderAuthFeedItems(items),
    [],
  );
  const afterMessages = useCallback(
    ({ sessionKey, feedItems }: { sessionKey: string; feedItems: FeedItem[] }) => {
      // Fire suggestion check on session completion.
      checkSuggestion(feedItems, sessionKey);

      const signalKey = providerAuthSignalKey(feedItems);
      const showInstructionChip =
        instructionSuggestion !== null &&
        instructionSuggestion.agentPath === path;

      // Determine if the turn is complete (last item is an assistant response,
      // not a user message or streaming chunk).
      const lastItem = feedItems[feedItems.length - 1];
      const turnComplete =
        lastItem &&
        lastItem.feed_type !== "user_message" &&
        lastItem.feed_type !== "assistant_text_streaming" &&
        lastItem.feed_type !== "thinking_streaming" &&
        lastItem.feed_type !== "thinking" &&
        lastItem.feed_type !== "tool_call" &&
        lastItem.feed_type !== "tool_result";

      // Find last user message text for intent detection.
      let routineChip: ReactNode = null;
      if (turnComplete) {
        const lastUserItem = [...feedItems]
          .reverse()
          .find((it) => it.feed_type === "user_message");
        if (lastUserItem && lastUserItem.feed_type === "user_message") {
          const userText = lastUserItem.data as string;
          const dismissKey = `${sessionKey}:${userText}`;
          if (!dismissedKeys.has(dismissKey)) {
            const intent = detectRoutineIntent(userText);
            if (intent.detected) {
              routineChip = (
                <RoutineSuggestionChip
                  intent={intent}
                  onAccept={handleRoutineAccept}
                  onDismiss={() =>
                    setDismissedKeys((prev) => new Set([...prev, dismissKey]))
                  }
                />
              );
            }
          }
        }
      }

      return (
        <>
          <ProviderReconnectCard
            providerId={signalKey ? effectiveProvider : undefined}
            signalKey={signalKey ?? undefined}
          />
          {showInstructionChip && (
            <InstructionSuggestionChip
              suggestion={instructionSuggestion.suggestion}
              onApply={handleApplySuggestion}
              onDismiss={handleDismissSuggestion}
            />
          )}
          {routineChip}
        </>
      );
    },
    [
      effectiveProvider,
      checkSuggestion,
      instructionSuggestion,
      path,
      handleApplySuggestion,
      handleDismissSuggestion,
      dismissedKeys,
      handleRoutineAccept,
    ],
  );

  const composerHeader = useMemo<AIBoardProps["composerHeader"]>(() => {
    if (!agent || !activeSkill) return undefined;
    return (
      <SelectedSkillChip
        skill={activeSkill}
        onCancel={() => setActiveSkill(null)}
      />
    );
  }, [agent, activeSkill]);

  const chatEmptyState = useMemo<AIBoardProps["chatEmptyState"]>(() => {
    if (!agent) return undefined;
    if (activeSkill) return null;
    if (emptySkillShowcase.length === 0) return undefined;
    return (
      <div className="self-stretch w-full h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full px-6 pt-6 pb-4 flex flex-col gap-3">
          <div className="text-center mb-1">
            <h3 className="text-base font-semibold text-foreground">
              {t("chatEmpty.heading")}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t("chatEmpty.subheading")}
            </p>
          </div>
          {emptySkillShowcase.map((s) => (
            <SkillCard
              key={s.name}
              image={s.image}
              title={humanizeSkillName(s.name)}
              description={s.description}
              integrations={s.integrations}
              onClick={() => applySkill(s)}
            />
          ))}
          {moreSkillsCount > 0 && (
            <Button
              size="sm"
              className="self-center mt-1 rounded-full gap-1.5"
              onClick={() => setPickerOpen(true)}
            >
              <Play className="size-3 fill-current" />
              {t("chatEmpty.seeMore", { count: moreSkillsCount })}
            </Button>
          )}
        </div>
      </div>
    );
  }, [agent, activeSkill, emptySkillShowcase, moreSkillsCount, t, applySkill]);

  const footer = useMemo<AIBoardProps["footer"]>(() => {
    if (!agent) return undefined;
    return ({ hasMessages }) => (
      <div className="flex items-center gap-2 w-full">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          data-keep-panel-open
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Play className="size-3 fill-current" />
          {t("composerSkill.browse")}
        </button>
        <ChatModelSelector
          provider={effectiveProvider}
          model={effectiveModel}
          onSelect={handleModelSelect}
          lockedProvider={hasMessages ? effectiveProvider : null}
        />
      </div>
    );
  }, [agent, t, effectiveProvider, effectiveModel, handleModelSelect]);

  const pickerDialog = agent ? (
    <NewMissionPickerDialog
      open={pickerOpen}
      onOpenChange={setPickerOpen}
      lockedAgent={agent}
      hideBlank
      onSkill={(_agentPath, skillName) => {
        const skill = (allSkills ?? []).find((s) => s.name === skillName);
        if (skill) applySkill(skill);
      }}
    />
  ) : null;

  return {
    chatEmptyState,
    composerHeader,
    canSendEmpty: activeSkill != null,
    onComposerSubmit: handleSkillComposerSubmit,
    footer,
    renderUserMessage,
    isSpecialTool,
    renderToolResult,
    processLabels,
    getThinkingMessage,
    terminalWsUrl: path ? getEngine().ptyWsUrl(path) : undefined,
    renderTurnSummary,
    renderSystemMessage,
    mapFeedItems,
    afterMessages,
    renderLink,
    pickerDialog,
    effectiveProvider,
    effectiveModel,
    chatProvider,
    chatModel,
  };
}
