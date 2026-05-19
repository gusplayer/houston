import { useTranslation } from "react-i18next";
import { BadgeCheck, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Badge, cn } from "@squad/core";
import type { StoreListing } from "../../lib/types";

/** Small "Official" pill for first-party Squad agents. */
export function OfficialBadge() {
  const { t } = useTranslation("store");
  return (
    <Badge className="gap-1 bg-primary/10 text-primary hover:bg-primary/15">
      <Sparkles className="size-3" />
      {t("store:badge.official")}
    </Badge>
  );
}

/** "Community" pill for third-party agents. */
export function CommunityBadge() {
  const { t } = useTranslation("store");
  return (
    <Badge variant="secondary" className="gap-1">
      <Users className="size-3" />
      {t("store:badge.community")}
    </Badge>
  );
}

/** "Verified" pill for publishers vouched for by Squad. */
export function VerifiedBadge() {
  const { t } = useTranslation("store");
  return (
    <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600">
      <BadgeCheck className="size-3" />
      {t("store:badge.verified")}
    </Badge>
  );
}

/** Pricing pill, derived from the listing's `pricing` field. */
export function PricingBadge({ pricing }: { pricing: StoreListing["pricing"] }) {
  const { t } = useTranslation("store");
  if (!pricing || pricing.kind === "free") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {t("store:badge.free")}
      </Badge>
    );
  }
  const amount = (pricing.price_cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: pricing.currency,
    maximumFractionDigits: 0,
  });
  return (
    <Badge className="gap-1 bg-amber-500/15 text-amber-700 hover:bg-amber-500/20">
      <ShieldCheck className="size-3" />
      {amount}
    </Badge>
  );
}

/** Picks the right source badge for a listing in one call. */
export function SourceBadge({ source, className }: { source?: StoreListing["source"]; className?: string }) {
  const isCommunity = source === "community" || source === "mock";
  return (
    <span className={cn("inline-flex", className)}>
      {isCommunity ? <CommunityBadge /> : <OfficialBadge />}
    </span>
  );
}
