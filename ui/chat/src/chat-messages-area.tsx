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
import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { MessageSquareIcon, MonitorIcon } from "lucide-react";
import { Button, cn } from "@squad/core";
import { ChatMessages } from "./chat-messages";
import type { ChatMessagesProps } from "./chat-messages";
import type { ChatStatus } from "./chat-panel-types";
import type { ChatMessage } from "./feed-to-messages";
import type { FeedItem } from "./types";

/**
 * Local error boundary for the embedded terminal view. The package-level
 * `ErrorBoundary` from `@squad/core` is generic — this one lets the
 * parent reset the surrounding view state (switch back to chat) when the
 * user clicks "Try again", so a transient xterm/WS init crash never
 * leaves the chat panel stuck on a broken view.
 *
 * English-only strings live here because `ui/chat` is i18n-agnostic per
 * the library boundary; the consuming app does NOT pass terminal labels
 * through props today, and this is a rare error-state surface.
 */
class TerminalErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.error("[Terminal] crashed:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
          <span>Terminal failed to load.</span>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false });
              this.props.onReset();
            }}
            className="text-foreground underline"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  emptyState?: ReactNode;
  terminalWsUrl?: string;
  /** When provided, the parent controls which view is shown (no internal toggles). */
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  messagesProps: Omit<ChatMessagesProps, "messages" | "status" | "thinkingIndicator">;
}

export function ChatMessagesArea({
  feedItems: _feedItems,
  messages,
  status,
  thinkingIndicator,
  emptyState,
  terminalWsUrl,
  viewMode: viewModeProp,
  onViewModeChange,
  messagesProps,
}: ChatMessagesAreaProps) {
  const [localViewMode, setLocalViewMode] = useState<ViewMode>("chat");
  const isControlled = viewModeProp !== undefined;
  const viewMode = isControlled ? viewModeProp : localViewMode;
  const setViewMode = isControlled
    ? (m: ViewMode) => onViewModeChange?.(m)
    : setLocalViewMode;
  const enterChatLabel = "Show chat view";

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      {/* Internal toggle buttons — only shown when parent is NOT controlling viewMode */}
      {!isControlled && (
        <div className="absolute top-2 right-3 z-10 flex items-center gap-0.5">
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
      )}

      {/* Content area */}
      {viewMode === "terminal" && terminalWsUrl ? (
        <TerminalErrorBoundary onReset={() => setViewMode("chat")}>
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
        </TerminalErrorBoundary>
      ) : messages.length === 0 && status === "ready" && emptyState ? (
        <div className="flex-1 min-h-0 flex items-center justify-center">
          {emptyState}
        </div>
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
