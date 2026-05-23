/**
 * Internal: messages area of ChatPanel. Hosts the Chat / Terminal view
 * toggle and switches between the two views. Extracted to keep
 * chat-panel.tsx under the size budget. Not exported from the package index.
 *
 * Views:
 *  - chat     — formatted ChatMessages (default)
 *  - terminal — live interactive `claude` PTY via xterm.js (opt-in; only
 *               shown when the parent passes `terminalWsUrl`)
 */
import { lazy, Suspense, useState, type ReactNode } from "react";
import { MessageSquareIcon, MonitorIcon } from "lucide-react";
import { Button, cn } from "@squad/core";
import { ChatMessages } from "./chat-messages";
import type { ChatMessagesProps } from "./chat-messages";
import type { ChatStatus } from "./chat-panel-types";
import type { ChatMessage } from "./feed-to-messages";
import type { FeedItem } from "./types";

// Lazy-load the xterm component so the heavy @xterm/xterm bundle is only
// fetched when the user actually clicks the Terminal toggle.
const SquadTerminal = lazy(() =>
  import("@squad/terminal").then((m) => ({ default: m.SquadTerminal })),
);

type ViewMode = "chat" | "terminal";

export interface ChatMessagesAreaProps {
  feedItems: FeedItem[];
  messages: ChatMessage[];
  status: ChatStatus;
  thinkingIndicator: ReactNode;
  terminalWsUrl?: string;
  messagesProps: Omit<ChatMessagesProps, "messages" | "status" | "thinkingIndicator">;
}

export function ChatMessagesArea({
  feedItems: _feedItems,
  messages,
  status,
  thinkingIndicator,
  terminalWsUrl,
  messagesProps,
}: ChatMessagesAreaProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const enterChatLabel = "Show chat view";

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      {/* Toggle buttons — top-right corner */}
      <div className="absolute top-2 right-3 z-10 flex items-center gap-0.5">
        {/* Chat toggle */}
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={() => setViewMode("chat")}
          aria-label={enterChatLabel}
          title={enterChatLabel}
          className={cn(
            "text-muted-foreground/60 hover:text-foreground",
            viewMode === "chat" && "text-foreground bg-accent/40",
          )}
        >
          <MessageSquareIcon size={14} />
        </Button>

        {/* Terminal toggle — only when the engine supports PTY for this agent */}
        {terminalWsUrl && (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => setViewMode("terminal")}
            aria-label="Open interactive terminal"
            title="Open interactive terminal"
            className={cn(
              "text-muted-foreground/60 hover:text-foreground",
              viewMode === "terminal" && "text-foreground bg-accent/40",
            )}
          >
            <MonitorIcon size={14} />
          </Button>
        )}
      </div>

      {/* Content area */}
      {viewMode === "terminal" && terminalWsUrl ? (
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
              Loading terminal…
            </div>
          }
        >
          <SquadTerminal
            wsUrl={terminalWsUrl}
            className="flex-1 min-h-0 px-2 py-2"
          />
        </Suspense>
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
