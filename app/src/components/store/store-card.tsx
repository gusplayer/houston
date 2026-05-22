import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { cn } from "@squad/core";
import type { StoreListing } from "../../lib/types";
import { IntegrationLogos } from "../integration-logos";
import { RatingStars } from "./rating-stars";
import {
  PricingBadge,
  SourceBadge,
  VerifiedBadge,
} from "./store-badge";

interface Props {
  listing: StoreListing;
  onSelect: (listing: StoreListing) => void;
  /** True if the listing is a real Squad-published agent. */
  isHouston?: boolean;
}

const MAX_INTEGRATIONS = 4;

/**
 * Single agent card for the Store grid. Click opens the detail dialog.
 * Click target is the whole card. Keep keyboard parity via the wrapping
 * <button>.
 */
export function StoreCard({ listing, onSelect, isHouston }: Props) {
  const { t } = useTranslation("store");
  const integrations = listing.integrations ?? [];
  const visible = integrations.slice(0, MAX_INTEGRATIONS);
  const overflow = integrations.length - visible.length;
  const publisherName = listing.publisher?.name ?? listing.author;
  const source = isHouston ? "squad" : listing.source ?? "community";
  const isPaid = listing.pricing?.kind === "paid";

  return (
    <button
      type="button"
      onClick={() => onSelect(listing)}
      className={cn(
        "group flex h-full flex-col items-stretch gap-3 rounded-2xl border border-border",
        "bg-card p-4 text-left transition-colors",
        "hover:border-foreground/20 hover:bg-secondary/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-medium text-foreground">
              {listing.name}
            </span>
          </div>
          <span className="truncate text-xs text-muted-foreground">
            {t("card.by", { name: publisherName })}
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1 justify-end">
          <SourceBadge source={source} />
          {listing.publisher?.verified && <VerifiedBadge />}
          {isPaid && <PricingBadge pricing={listing.pricing} />}
        </div>
      </div>

      <p className="line-clamp-2 text-sm text-muted-foreground">
        {listing.description}
      </p>

      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <div className="flex min-w-0 items-center gap-2">
          {visible.length > 0 && <IntegrationLogos toolkits={visible} />}
          {overflow > 0 && (
            <span className="text-xs text-muted-foreground">
              {t("card.moreIntegrations", { count: overflow })}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {listing.rating !== undefined && (
            <RatingStars
              rating={listing.rating}
              reviewsCount={listing.reviews_count}
              showCount={false}
            />
          )}
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
            <Download className="size-3" />
            {t("card.installs", { count: listing.installs })}
          </span>
        </div>
      </div>
    </button>
  );
}
