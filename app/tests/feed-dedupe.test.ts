import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";
import { dedupeFeed } from "../../ui/chat/src/feed-merge.ts";
import type { FeedItem } from "../../ui/chat/src/types.ts";

describe("dedupeFeed", () => {
  it("collapses a back-to-back duplicate assistant_text", () => {
    const items: FeedItem[] = [
      { feed_type: "user_message", data: "quien eres?" },
      { feed_type: "assistant_text", data: "Soy Adam, arquitecto." },
      { feed_type: "assistant_text", data: "Soy Adam, arquitecto." },
    ];
    deepStrictEqual(dedupeFeed(items), [
      { feed_type: "user_message", data: "quien eres?" },
      { feed_type: "assistant_text", data: "Soy Adam, arquitecto." },
    ]);
  });

  it("keeps distinct assistant_text blocks within a turn", () => {
    const items: FeedItem[] = [
      { feed_type: "assistant_text", data: "First part." },
      { feed_type: "tool_call", data: { name: "read", input: {} } },
      { feed_type: "assistant_text", data: "Second part." },
    ];
    deepStrictEqual(dedupeFeed(items), items);
  });

  it("does not collapse identical text separated by a different item", () => {
    // A tool_call between two identical texts breaks adjacency, so both stay.
    const items: FeedItem[] = [
      { feed_type: "assistant_text", data: "Same." },
      { feed_type: "tool_call", data: { name: "x", input: null } },
      { feed_type: "assistant_text", data: "Same." },
    ];
    deepStrictEqual(dedupeFeed(items), items);
  });

  it("collapses duplicate final_result and thinking too", () => {
    const items: FeedItem[] = [
      { feed_type: "thinking", data: "hmm" },
      { feed_type: "thinking", data: "hmm" },
      { feed_type: "final_result", data: { result: "ok", cost_usd: null, duration_ms: null } },
      { feed_type: "final_result", data: { result: "ok", cost_usd: null, duration_ms: null } },
    ];
    deepStrictEqual(dedupeFeed(items), [
      { feed_type: "thinking", data: "hmm" },
      { feed_type: "final_result", data: { result: "ok", cost_usd: null, duration_ms: null } },
    ]);
  });

  it("leaves a clean feed untouched", () => {
    const items: FeedItem[] = [
      { feed_type: "user_message", data: "hi" },
      { feed_type: "assistant_text", data: "hello" },
    ];
    deepStrictEqual(dedupeFeed(items), items);
  });
});
