/**
 * Terminal-style raw view of the feed. Renders FeedItem[] verbatim — no
 * markdown rendering, no collapsing of tool / thinking blocks. Aimed at
 * technical users who want to see exactly what's flowing through.
 */
import { useMemo } from "react";
import {
  Conversation,
  ConversationAutoScroll,
  ConversationContent,
  ConversationScrollButton,
} from "./ai-elements/conversation";
import { RawLine } from "./raw-feed-line";
import type { FeedItem } from "./types";

export interface RawFeedViewLabels {
  empty?: string;
  expand?: string;
  collapse?: string;
}

export interface RawFeedViewProps {
  feedItems: FeedItem[];
  status: "ready" | "streaming" | "submitted";
  labels?: RawFeedViewLabels;
}

const DEFAULT_LABELS: Required<RawFeedViewLabels> = {
  empty: "Stream is empty.",
  expand: "Show more",
  collapse: "Show less",
};

export function RawFeedView({ feedItems, status, labels }: RawFeedViewProps) {
  const l = useMemo(() => ({ ...DEFAULT_LABELS, ...labels }), [labels]);
  return (
    <Conversation className="flex-1 min-h-0">
      <ConversationAutoScroll status={status} />
      <ConversationContent className="max-w-3xl mx-auto font-mono text-xs leading-5 gap-0 p-4">
        {feedItems.length === 0 ? (
          <div className="text-muted-foreground/60 italic">{l.empty}</div>
        ) : (
          feedItems.map((item, i) => (
            <RawLine
              key={`${i}-${item.feed_type}`}
              item={item}
              expandLabel={l.expand}
              collapseLabel={l.collapse}
            />
          ))
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
