import type { StoreListing } from "../../lib/types";
import type {
  StoreCategory,
  StorePricingFilter,
  StoreSort,
  StoreSourceFilter,
} from "./store-filters";

interface FilterArgs {
  query: string;
  source: StoreSourceFilter;
  pricing: StorePricingFilter;
  category: StoreCategory;
  sort: StoreSort;
  /** Listings whose IDs are in this set are treated as official. */
  houstonIds: Set<string>;
}

/**
 * Pure helper that filters and sorts a flat list of store listings. Kept
 * outside the page component so it can be unit-tested without rendering.
 */
export function filterAndSortListings(
  listings: StoreListing[],
  args: FilterArgs,
): StoreListing[] {
  const q = args.query.trim().toLowerCase();
  const filtered = listings.filter((l) => {
    if (args.category !== "all" && l.category !== args.category) return false;

    const isOfficial = args.houstonIds.has(l.id) || l.source === "houston";
    if (args.source === "official" && !isOfficial) return false;
    if (args.source === "community" && isOfficial) return false;

    const isPaid = l.pricing?.kind === "paid";
    if (args.pricing === "paid" && !isPaid) return false;
    if (args.pricing === "free" && isPaid) return false;

    if (q.length > 0) {
      const haystack = [
        l.name,
        l.description,
        l.author,
        l.publisher?.name ?? "",
        ...(l.tags ?? []),
        ...(l.integrations ?? []),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  return sortListings(filtered, args.sort);
}

function sortListings(listings: StoreListing[], sort: StoreSort): StoreListing[] {
  const copy = listings.slice();
  switch (sort) {
    case "newest":
      copy.sort((a, b) => b.registered_at.localeCompare(a.registered_at));
      break;
    case "installs":
      copy.sort((a, b) => b.installs - a.installs);
      break;
    case "rating":
      copy.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      break;
    case "trending":
    default:
      // Lightweight trending: a small blend of installs + rating + recency.
      copy.sort((a, b) => trendingScore(b) - trendingScore(a));
  }
  return copy;
}

function trendingScore(l: StoreListing): number {
  const installScore = Math.log10(Math.max(1, l.installs));
  const rating = l.rating ?? 0;
  const recency = recencyBoost(l.registered_at);
  return installScore * 2 + rating + recency;
}

function recencyBoost(date: string): number {
  const ts = Date.parse(date);
  if (Number.isNaN(ts)) return 0;
  const days = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  if (days < 30) return 1.5;
  if (days < 90) return 1;
  if (days < 180) return 0.5;
  return 0;
}
