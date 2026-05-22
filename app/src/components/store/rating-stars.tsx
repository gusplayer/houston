import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";
import { cn } from "@squad/core";

interface Props {
  /** Rating from 0 to 5, fractional allowed (e.g. 4.7). */
  rating: number;
  /** Number of reviews behind the rating, used for the aria-label. */
  reviewsCount?: number;
  /** Optional muted "(N)" review count after the stars. */
  showCount?: boolean;
  /** Star icon size. Default 14. */
  size?: number;
  className?: string;
}

/**
 * Read-only star display. Renders 5 stars where each is filled by the
 * fraction of the rating that falls inside it. Accessible via aria-label
 * built from the `ratingLabel` i18n key.
 */
export function RatingStars({
  rating,
  reviewsCount,
  showCount = true,
  size = 14,
  className,
}: Props) {
  const { t } = useTranslation("store");
  const clamped = Math.max(0, Math.min(5, rating));
  const label = t("store:ratingLabel", {
    rating: clamped.toFixed(1),
    count: reviewsCount ?? 0,
  });

  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-1 text-xs text-muted-foreground",
        className,
      )}
    >
      <span className="inline-flex">
        {[0, 1, 2, 3, 4].map((i) => {
          const fill = Math.max(0, Math.min(1, clamped - i));
          return <StarCell key={i} fill={fill} size={size} />;
        })}
      </span>
      <span className="tabular-nums text-foreground">{clamped.toFixed(1)}</span>
      {showCount && reviewsCount !== undefined && (
        <span className="tabular-nums">({reviewsCount.toLocaleString()})</span>
      )}
    </span>
  );
}

function StarCell({ fill, size }: { fill: number; size: number }) {
  // We stack a muted outline star with a clipped filled star on top.
  return (
    <span className="relative inline-block" style={{ width: size, height: size }}>
      <Star
        className="absolute inset-0 text-muted-foreground/40"
        style={{ width: size, height: size }}
      />
      <span
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${fill * 100}%` }}
      >
        <Star
          className="text-amber-500 fill-amber-500"
          style={{ width: size, height: size }}
        />
      </span>
    </span>
  );
}
