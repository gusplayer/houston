/**
 * Per-FeedItem renderer for the raw terminal view. One block per item,
 * tagged with a color-coded prefix. Long content gets a manual expand
 * toggle so the stream stays scannable.
 */
import { useState } from "react";
import { cn } from "@squad/core";
import type { FeedItem } from "./types";

const TRUNCATE_CHARS = 600;

export interface RawLineProps {
  item: FeedItem;
  expandLabel: string;
  collapseLabel: string;
}

export function RawLine({ item, expandLabel, collapseLabel }: RawLineProps) {
  switch (item.feed_type) {
    case "user_message":
      return <Block tag="user" tone="cyan"><PreText text={item.data} /></Block>;

    case "assistant_text":
    case "assistant_text_streaming":
      return <Block tag="assistant" tone="foreground"><PreText text={item.data} /></Block>;

    case "thinking":
    case "thinking_streaming":
      return (
        <Block tag="thinking" tone="muted">
          <Truncatable text={item.data} expandLabel={expandLabel} collapseLabel={collapseLabel} />
        </Block>
      );

    case "tool_call": {
      const json = item.data.input == null ? "" : safeStringify(item.data.input);
      return (
        <Block tag={`tool ${item.data.name}`} tone="green">
          {json && (
            <Truncatable text={json} expandLabel={expandLabel} collapseLabel={collapseLabel} />
          )}
        </Block>
      );
    }

    case "tool_result":
      return (
        <Block
          tag={item.data.is_error ? "result error" : "result"}
          tone={item.data.is_error ? "red" : "muted"}
        >
          <Truncatable
            text={item.data.content}
            expandLabel={expandLabel}
            collapseLabel={collapseLabel}
          />
        </Block>
      );

    case "tool_runtime_error":
      return (
        <Block tag={`runtime error · ${item.data.kind}`} tone="red">
          <PreText text={item.data.details} />
        </Block>
      );

    case "system_message":
      return <Block tag="system" tone="amber"><PreText text={item.data} /></Block>;

    case "file_changes": {
      const lines: string[] = [];
      for (const p of item.data.created) lines.push(`+ ${p}`);
      for (const p of item.data.modified) lines.push(`~ ${p}`);
      if (lines.length === 0) return null;
      return <Block tag="files" tone="blue"><PreText text={lines.join("\n")} /></Block>;
    }

    case "final_result": {
      const parts: string[] = [];
      if (item.data.cost_usd != null) parts.push(`$${item.data.cost_usd.toFixed(4)}`);
      if (item.data.duration_ms != null) parts.push(`${item.data.duration_ms}ms`);
      if (parts.length === 0) return null;
      return <Block tag="done" tone="green"><PreText text={parts.join(" · ")} /></Block>;
    }
  }
}

type Tone = "cyan" | "foreground" | "muted" | "green" | "red" | "amber" | "blue";

const TONE_CLASS: Record<Tone, string> = {
  cyan: "text-sky-400",
  foreground: "text-foreground",
  muted: "text-muted-foreground/70",
  green: "text-emerald-400",
  red: "text-rose-400",
  amber: "text-amber-400",
  blue: "text-blue-400",
};

function Block({ tag, tone, children }: { tag: string; tone: Tone; children?: React.ReactNode }) {
  return (
    <div className="py-1">
      <div className={cn("uppercase tracking-wider text-[10px]", TONE_CLASS[tone])}>[{tag}]</div>
      {children && <div className="pl-3 text-foreground/90">{children}</div>}
    </div>
  );
}

function PreText({ text }: { text: string }) {
  return <pre className="whitespace-pre-wrap break-words font-mono">{text}</pre>;
}

function Truncatable({ text, expandLabel, collapseLabel }: {
  text: string;
  expandLabel: string;
  collapseLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const tooLong = text.length > TRUNCATE_CHARS;
  const visible = open || !tooLong ? text : text.slice(0, TRUNCATE_CHARS) + "…";
  return (
    <div>
      <PreText text={visible} />
      {tooLong && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/60 hover:text-foreground transition-colors"
        >
          {open ? collapseLabel : expandLabel}
        </button>
      )}
    </div>
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
