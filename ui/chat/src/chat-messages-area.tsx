/**
 * Internal: messages area of ChatPanel. Hosts the Chat ↔ Raw view toggle
 * and switches between the formatted ChatMessages and the terminal-style
 * RawFeedView. Extracted to keep chat-panel.tsx under the size budget.
 * Not exported from the package index.
 */
import { useState, type ReactNode } from "react";
import { MessageSquareIcon, TerminalIcon } from "lucide-react";
import { Button, cn } from "@squad/core";
import { ChatMessages } from "./chat-messages";
import type { ChatMessagesProps } from "./chat-messages";
import type { ChatStatus, RawViewLabels } from "./chat-panel-types";
import type { ChatMessage } from "./feed-to-messages";
import { RawFeedView } from "./raw-feed-view";
import type { FeedItem } from "./types";

export interface ChatMessagesAreaProps {
  feedItems: FeedItem[];
  messages: ChatMessage[];
  status: ChatStatus;
  thinkingIndicator: ReactNode;
  rawViewLabels?: RawViewLabels;
  messagesProps: Omit<ChatMessagesProps, "messages" | "status" | "thinkingIndicator">;
}

export function ChatMessagesArea({
  feedItems,
  messages,
  status,
  thinkingIndicator,
  rawViewLabels,
  messagesProps,
}: ChatMessagesAreaProps) {
  const [viewMode, setViewMode] = useState<"chat" | "raw">("chat");
  const isRaw = viewMode === "raw";
  const enterRawLabel = rawViewLabels?.toggle?.enterRaw ?? "Show raw stream";
  const enterChatLabel = rawViewLabels?.toggle?.enterChat ?? "Show chat view";

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        onClick={() => setViewMode(isRaw ? "chat" : "raw")}
        aria-label={isRaw ? enterChatLabel : enterRawLabel}
        title={isRaw ? enterChatLabel : enterRawLabel}
        className={cn(
          "absolute top-2 right-3 z-10 text-muted-foreground/60 hover:text-foreground",
          isRaw && "text-foreground bg-accent/40",
        )}
      >
        {isRaw ? <MessageSquareIcon size={14} /> : <TerminalIcon size={14} />}
      </Button>
      {isRaw ? (
        <RawFeedView feedItems={feedItems} status={status} labels={rawViewLabels?.stream} />
      ) : (
        <ChatMessages
          messages={messages}
          status={status}
          thinkingIndicator={thinkingIndicator}
          {...messagesProps}
        />
      )}
    </div>
  );
}
