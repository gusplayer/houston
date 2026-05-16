import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Github } from "lucide-react";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import type { StoreListing } from "../../lib/types";
import { IntegrationLogos } from "../integration-logos";
import { RatingStars } from "./rating-stars";
import {
  PricingBadge,
  SourceBadge,
  VerifiedBadge,
} from "./store-badge";
import { InstallConfirmDialog } from "./install-confirm-dialog";
import { DetailSection } from "./detail-section";

interface Props {
  open: boolean;
  listing: StoreListing | null;
  onOpenChange: (open: boolean) => void;
  /** True for real Houston-published agents from the engine catalog. */
  isHouston: boolean;
  /** Called when the user confirms install for a non-Houston, non-mock agent. */
  onInstall: (listing: StoreListing) => Promise<void>;
  /** Called for real Houston agents that install directly. */
  onInstallHouston: (listing: StoreListing) => Promise<void>;
}

export function StoreDetailDialog({
  open,
  listing,
  onOpenChange,
  isHouston,
  onInstall,
  onInstallHouston,
}: Props) {
  const { t } = useTranslation("store");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  if (!listing) return null;

  const isMock = listing.source === "mock";
  const publisher = listing.publisher?.name ?? listing.author;
  const github =
    listing.publisher?.github_url ?? `https://github.com/${listing.repo}`;
  const source = isHouston ? "houston" : listing.source ?? "community";

  const handlePrimary = async () => {
    if (isMock) return;
    if (isHouston) {
      setInstalling(true);
      try {
        await onInstallHouston(listing);
        onOpenChange(false);
      } finally {
        setInstalling(false);
      }
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    setInstalling(true);
    try {
      await onInstall(listing);
      setConfirmOpen(false);
      onOpenChange(false);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <DialogTitle className="text-xl">{listing.name}</DialogTitle>
                <span className="text-sm text-muted-foreground">
                  {t("detail.publisher")} {publisher}
                  {listing.version && (
                    <span className="ml-2 text-muted-foreground/70">
                      {t("detail.version", { version: listing.version })}
                    </span>
                  )}
                </span>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1 justify-end pr-7">
                <SourceBadge source={source} />
                {listing.publisher?.verified && <VerifiedBadge />}
                {listing.pricing && <PricingBadge pricing={listing.pricing} />}
              </div>
            </div>
          </DialogHeader>

          <div className="flex flex-col gap-5 pt-2">
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {listing.rating !== undefined && (
                <RatingStars
                  rating={listing.rating}
                  reviewsCount={listing.reviews_count}
                />
              )}
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Download className="size-4" />
                {t("card.installs", { count: listing.installs })}
              </span>
              <a
                href={github}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <Github className="size-4" />
                {t("detail.viewSource")}
              </a>
            </div>

            <p className="text-sm text-foreground/90">{listing.description}</p>

            {listing.integrations && listing.integrations.length > 0 && (
              <DetailSection title={t("detail.integrations")}>
                <IntegrationLogos
                  toolkits={listing.integrations}
                  small={false}
                />
              </DetailSection>
            )}

            {listing.tags.length > 0 && (
              <DetailSection title={t("detail.tags")}>
                <div className="flex flex-wrap gap-1.5">
                  {listing.tags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </DetailSection>
            )}

            {listing.screenshots && listing.screenshots.length > 0 && (
              <DetailSection title={t("detail.screenshots")}>
                <div className="flex gap-2 overflow-x-auto">
                  {listing.screenshots.map((url) => (
                    <img
                      key={url}
                      src={url}
                      alt=""
                      className="h-40 shrink-0 rounded-lg border border-border"
                    />
                  ))}
                </div>
              </DetailSection>
            )}

            {isMock && (
              <p className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                {t("detail.comingSoonHint")}
              </p>
            )}

            <div className="flex justify-end pt-2">
              <Button
                onClick={handlePrimary}
                disabled={isMock || installing}
                title={isMock ? t("detail.comingSoonHint") : undefined}
              >
                {isMock ? t("detail.comingSoon") : t("detail.install")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <InstallConfirmDialog
        open={confirmOpen}
        listing={listing}
        onOpenChange={setConfirmOpen}
        onConfirm={handleConfirm}
        installing={installing}
      />
    </>
  );
}
