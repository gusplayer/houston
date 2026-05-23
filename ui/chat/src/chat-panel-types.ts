import type { ReactNode } from "react";
import type { ToolsAndCardsProps } from "./chat-helpers";
import type { ChatMessagesProps } from "./chat-messages";
import type { ChatMessage } from "./feed-to-messages";
import type { QueuedChatMessage, QueuedMessageLabels } from "./queued-message-list";
import type { RawFeedViewLabels } from "./raw-feed-view";
import type { FeedItem } from "./types";

export type ChatStatus = "ready" | "streaming" | "submitted";

export interface RawViewToggleLabels {
  /** Tooltip + aria-label shown when chat view is active (click enters raw). */
  enterRaw?: string;
  /** Tooltip + aria-label shown when raw view is active (click returns to chat). */
  enterChat?: string;
}

export interface RawViewLabels {
  toggle?: RawViewToggleLabels;
  stream?: RawFeedViewLabels;
}

export interface AttachmentRejection {
  file: File;
  reason: string;
}

export interface PreparedAttachments {
  accepted: File[];
  rejected: AttachmentRejection[];
}

export type PrepareAttachments = (incoming: File[], existing: File[]) => PreparedAttachments;

export interface ChatPanelProps {
  sessionKey: string;
  feedItems: FeedItem[];
  onSend: (text: string, files: File[]) => void | Promise<void>;
  onStop?: () => void;
  onBack?: () => void;
  isLoading: boolean;
  placeholder?: string;
  emptyState?: ReactNode;
  value?: string;
  onValueChange?: (value: string) => void;
  /** Increment/change this value to focus the composer textarea. */
  composerFocusToken?: number;
  attachments?: File[];
  onAttachmentsChange?: (files: File[]) => void;
  onNotice?: (message: string) => void;
  prepareAttachments?: PrepareAttachments;
  onAttachmentRejections?: (rejections: AttachmentRejection[]) => void;
  footer?: ReactNode;
  composerHeader?: ReactNode;
  queuedMessages?: QueuedChatMessage[];
  onRemoveQueuedMessage?: (id: string) => void;
  queuedLabels?: QueuedMessageLabels;
  canSendEmpty?: boolean;
  status?: ChatStatus;
  thinkingIndicator?: ReactNode;
  transformContent?: (content: string) => { content: string; extra?: ReactNode };
  toolLabels?: ToolsAndCardsProps["toolLabels"];
  isSpecialTool?: ToolsAndCardsProps["isSpecialTool"];
  renderToolResult?: ToolsAndCardsProps["renderToolResult"];
  processLabels?: ChatMessagesProps["processLabels"];
  getThinkingMessage?: ChatMessagesProps["getThinkingMessage"];
  renderMessageAvatar?: (msg: ChatMessage) => ReactNode | undefined;
  renderSystemMessage?: (msg: ChatMessage) => ReactNode | undefined;
  renderUserMessage?: (msg: ChatMessage) => ReactNode | undefined;
  afterMessages?: ReactNode;
  renderTurnSummary?: ChatMessagesProps["renderTurnSummary"];
  onOpenLink?: (url: string) => void;
  renderLink?: ChatMessagesProps["renderLink"];
  composerOverride?: ReactNode;
  /** Labels for the optional Chat / Raw view toggle and the raw stream itself. */
  rawViewLabels?: RawViewLabels;
}
