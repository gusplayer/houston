import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Store as StoreIcon } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Input,
} from "@houston-ai/core";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import type { StoreListing } from "../../lib/types";
import { MOCK_COMMUNITY_AGENTS } from "./mock-catalog";
import { StoreCard } from "./store-card";
import { StoreDetailDialog } from "./store-detail-dialog";
import { ImportFromUrlDialog } from "./import-from-url-dialog";
import { useStoreDeepLink } from "./use-store-deep-link";
import {
  StoreFilters,
  type StoreCategory,
  type StoreSourceFilter,
} from "./store-filters";
import { filterAndSortListings } from "./store-sorter";

export function StorePage() {
  const { t } = useTranslation("store");
  const storeCatalog = useAgentCatalogStore((s) => s.storeCatalog);
  const installAgent = useAgentCatalogStore((s) => s.installAgent);

  const [query, setQuery] = useState("");
  const [source, setSource] = useState<StoreSourceFilter>("all");
  const [category, setCategory] = useState<StoreCategory>("all");
  const [importOpen, setImportOpen] = useState(false);
  const [active, setActive] = useState<StoreListing | null>(null);
  const [activeIsHouston, setActiveIsHouston] = useState(false);
  // Set when a deep-link agent id is not in the catalog. Drives the fallback dialog.
  const [unknownAgentId, setUnknownAgentId] = useState<string | null>(null);

  // The set of real Houston-published agent IDs comes straight from the
  // engine catalog. Anything else here is a mock community preview.
  const houstonIds = useMemo(
    () => new Set(storeCatalog.map((l) => l.id)),
    [storeCatalog],
  );

  const merged: StoreListing[] = useMemo(() => {
    const houston = storeCatalog.map((l) => ({
      ...l,
      source: (l.source ?? "houston") as StoreListing["source"],
    }));
    return [...houston, ...MOCK_COMMUNITY_AGENTS];
  }, [storeCatalog]);

  const visible = useMemo(
    () =>
      filterAndSortListings(merged, {
        query,
        source,
        pricing: "all",
        category,
        sort: "trending",
        houstonIds,
      }),
    [merged, query, source, category, houstonIds],
  );

  const openListing = useCallback(
    (l: StoreListing) => {
      setActive(l);
      setActiveIsHouston(houstonIds.has(l.id));
    },
    [houstonIds],
  );

  const handleMissingAgent = useCallback((agentId: string) => {
    setUnknownAgentId(agentId);
  }, []);

  // Connect `houston://store/agent/<id>` (stored on useUIStore.storeAgentId)
  // to the dialog state. The hook clears storeAgentId after handling so the effect cannot loop.
  useStoreDeepLink({ merged, onMatch: openListing, onMissing: handleMissingAgent });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-col gap-4 px-8 py-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <StoreIcon className="size-6 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("title")}
            </h1>
          </div>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            {t("import.trigger")}
          </Button>
        </div>
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search.placeholder")}
            className="pl-9"
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-6 overflow-hidden px-8 pb-8">
        <StoreFilters
          source={source}
          onSourceChange={setSource}
          category={category}
          onCategoryChange={setCategory}
        />
        <main className="min-w-0 flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <Empty className="border-0">
                <EmptyHeader>
                  <EmptyTitle>{t("empty.title")}</EmptyTitle>
                  <EmptyDescription>{t("empty.hint")}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((listing) => (
                <StoreCard
                  key={listing.id}
                  listing={listing}
                  isHouston={houstonIds.has(listing.id)}
                  onSelect={openListing}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      <StoreDetailDialog
        open={active !== null}
        listing={active}
        isHouston={activeIsHouston}
        onOpenChange={(open) => {
          if (!open) setActive(null);
        }}
        onInstall={async (l) => {
          await installAgent(l);
        }}
        onInstallHouston={async (l) => {
          await installAgent(l);
        }}
      />

      <ImportFromUrlDialog open={importOpen} onOpenChange={setImportOpen} />

      <Dialog
        open={unknownAgentId !== null}
        onOpenChange={(open) => {
          if (!open) setUnknownAgentId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("notFound.title")}</DialogTitle>
            <DialogDescription>
              {t("notFound.body", { id: unknownAgentId ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnknownAgentId(null)}>
              {t("notFound.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
