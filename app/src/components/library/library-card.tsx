import { useTranslation } from "react-i18next";
import { ExternalLink, Star } from "lucide-react";
import { Button, cn } from "@squad/core";

export interface LibraryCardEntry {
  /** Stable id — `owner/repo` for community; slug for "Mine". */
  id: string;
  title: string;
  description: string;
  /** External link (GitHub repo). Optional for "Mine" entries. */
  url?: string;
  /** Stars (community) or undefined (Mine). */
  stars?: number;
  /** True if this entry is already present in the user's library. */
  installed: boolean;
  /** True if also present in the active agent. */
  inAgent?: boolean;
  /** Reserved badge for the future verified-publisher program. */
  verified?: boolean;
}

interface Props {
  entry: LibraryCardEntry;
  busy: boolean;
  onInstall: () => void;
  onAddToAgent?: () => void;
}

/**
 * Library card — one per discovered or installed primitive.
 *
 * The card surfaces the two-step UX explicitly: a community entry first
 * gets `Install` (writes to `~/.squad/library/`), then `Add to this
 * agent` (writes to the active agent root). "Mine" entries skip step 1.
 */
export function LibraryCard({ entry, busy, onInstall, onAddToAgent }: Props) {
  const { t } = useTranslation("library");

  const primary = entry.installed
    ? entry.inAgent
      ? { label: t("card.inAgent"), disabled: true, onClick: () => {} }
      : {
          label: t("card.addToAgent"),
          disabled: busy || !onAddToAgent,
          onClick: () => onAddToAgent?.(),
        }
    : { label: t("card.install"), disabled: busy, onClick: onInstall };

  return (
    <div
      className={cn(
        "flex h-full flex-col gap-3 rounded-2xl border border-border",
        "bg-card p-4 transition-colors",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-base font-medium text-foreground">
            {entry.title}
          </span>
        </div>
        {entry.verified && (
          <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-500">
            {t("badges.verified")}
          </span>
        )}
      </div>

      <p className="line-clamp-3 flex-1 text-sm text-muted-foreground">
        {entry.description || t("card.noDescription")}
      </p>

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {entry.stars !== undefined && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Star className="size-3" />
              {entry.stars}
            </span>
          )}
          {entry.url && (
            <a
              href={entry.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <ExternalLink className="size-3" />
              {t("card.source")}
            </a>
          )}
        </div>
        <Button
          size="sm"
          variant={entry.installed && !entry.inAgent ? "default" : "outline"}
          onClick={primary.onClick}
          disabled={primary.disabled}
        >
          {primary.label}
        </Button>
      </div>
    </div>
  );
}
