import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Search } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  cn,
} from "@squad/core";
import type { LibraryKind } from "@squad/engine-client";
import {
  useCopyLibraryToAgent,
  useInstallFromUrl,
  useUserLibrary,
} from "../../hooks/queries/use-library";
import { useLibraryCatalog } from "../../hooks/queries/use-library-catalog";
import { useUIStore } from "../../stores/ui";
import { AddByUrlDialog } from "./add-by-url-dialog";
import { LibraryCard, type LibraryCardEntry } from "./library-card";

type SourceFilter = "all" | "community" | "mine";

interface Props {
  open: boolean;
  /** Which library to browse. Determines the GitHub topic + install path. */
  kind: LibraryKind;
  /** Active agent. Required for the "Add to this agent" step. */
  agentPath?: string;
  /** Lowercased set of skill names already present in the active agent.
   * Used to flip the card CTA to "In this agent". */
  installedInAgent?: Set<string>;
  onOpenChange: (open: boolean) => void;
}

export function LibraryDialog({
  open,
  kind,
  agentPath,
  installedInAgent,
  onOpenChange,
}: Props) {
  const { t } = useTranslation("library");
  const [source, setSource] = useState<SourceFilter>("all");
  const [query, setQuery] = useState("");
  const [addByUrlOpen, setAddByUrlOpen] = useState(false);

  const userLibrary = useUserLibrary(kind);
  const catalog = useLibraryCatalog(kind, query);
  const installMutation = useInstallFromUrl(kind);
  const copyMutation = useCopyLibraryToAgent(kind, agentPath);
  const addToast = useUIStore((s) => s.addToast);

  const installedSlugs = useMemo(
    () => new Set((userLibrary.data ?? []).map((i) => i.slug)),
    [userLibrary.data],
  );

  const entries = useMemo<LibraryCardEntry[]>(() => {
    const mine: LibraryCardEntry[] = (userLibrary.data ?? []).map((item) => ({
      id: `mine:${item.slug}`,
      title: item.name,
      description: item.description,
      url: item.sourceUrl,
      installed: true,
      inAgent: installedInAgent?.has(item.slug.toLowerCase()) ?? false,
      verified: item.verified,
    }));

    if (source === "mine") return mine;

    const community: LibraryCardEntry[] = (catalog.data ?? []).map((repo) => {
      const slug = repo.repo.toLowerCase();
      return {
        id: repo.id,
        title: repo.name,
        description: repo.description,
        url: repo.url,
        stars: repo.stars,
        installed: installedSlugs.has(slug),
        inAgent: installedInAgent?.has(slug) ?? false,
        verified: false,
      };
    });

    if (source === "community") return community;

    // "all" — mine first (already installed = closer to user), then community
    // entries that aren't duplicates.
    const mineIds = new Set(mine.map((m) => m.id));
    return [...mine, ...community.filter((c) => !mineIds.has(`mine:${c.id}`))];
  }, [source, userLibrary.data, catalog.data, installedSlugs, installedInAgent]);

  const handleInstall = async (entry: LibraryCardEntry) => {
    if (!entry.url) return;
    try {
      await installMutation.mutateAsync(entry.url);
      addToast({
        title: t("dialog.installed", { name: entry.title }),
        variant: "success",
      });
    } catch (err) {
      addToast({
        title: t("dialog.installError"),
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    }
  };

  const handleAddToAgent = async (entry: LibraryCardEntry) => {
    if (!agentPath) return;
    const slug = entry.id.startsWith("mine:")
      ? entry.id.slice("mine:".length)
      : entry.id.split("/")[1].toLowerCase();
    try {
      await copyMutation.mutateAsync(slug);
      addToast({
        title: t("dialog.addedToAgent", { name: entry.title }),
        variant: "success",
      });
    } catch (err) {
      addToast({
        title: t("dialog.addError"),
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    }
  };

  const busy = installMutation.isPending || copyMutation.isPending;
  const loading = userLibrary.isLoading || catalog.isLoading;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[80vh] max-w-4xl flex-col">
          <DialogHeader className="flex flex-row items-center justify-between gap-3">
            <DialogTitle>{t(`dialog.title.${kind}`)}</DialogTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAddByUrlOpen(true)}
            >
              <Plus className="mr-1 size-3.5" />
              {t("dialog.addByUrl")}
            </Button>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("dialog.searchPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center gap-2 text-xs">
            {(["all", "community", "mine"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSource(s)}
                className={cn(
                  "rounded-full border px-3 py-1",
                  source === s
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground/40",
                )}
              >
                {t(`dialog.source.${s}`)}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("dialog.loading")}
              </p>
            )}
            {!loading && entries.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("dialog.empty")}
              </p>
            )}
            {!loading && entries.length > 0 && (
              <div className="grid grid-cols-1 gap-3 py-1 md:grid-cols-2 lg:grid-cols-3">
                {entries.map((entry) => (
                  <LibraryCard
                    key={entry.id}
                    entry={entry}
                    busy={busy}
                    onInstall={() => handleInstall(entry)}
                    onAddToAgent={
                      agentPath ? () => handleAddToAgent(entry) : undefined
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AddByUrlDialog
        open={addByUrlOpen}
        kind={kind}
        onOpenChange={setAddByUrlOpen}
      />
    </>
  );
}
