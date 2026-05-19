import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { filterAndSortListings } from "../src/components/store/store-sorter.ts";
import type { StoreListing } from "../src/lib/types.ts";

// Date used for relative-recency assertions. Tests use fixed dates so the
// trending score does not depend on the wall clock.
const today = new Date().toISOString().slice(0, 10);

function listing(over: Partial<StoreListing> & { id: string }): StoreListing {
  return {
    id: over.id,
    name: over.name ?? over.id,
    description: over.description ?? "",
    category: over.category ?? "business",
    author: over.author ?? "Houston",
    tags: over.tags ?? [],
    icon_url: over.icon_url ?? "rocket",
    integrations: over.integrations ?? [],
    repo: over.repo ?? `houston/${over.id}`,
    installs: over.installs ?? 0,
    registered_at: over.registered_at ?? today,
    source: over.source,
    rating: over.rating,
    pricing: over.pricing,
    publisher: over.publisher,
  } as StoreListing;
}

const baseArgs = {
  query: "",
  source: "all" as const,
  pricing: "all" as const,
  category: "all" as const,
  sort: "trending" as const,
  squadIds: new Set<string>(),
};

describe("filterAndSortListings", () => {
  it("empty input returns empty", () => {
    deepStrictEqual(filterAndSortListings([], baseArgs), []);
  });

  it("sorts by 'newest' using registered_at descending", () => {
    const items = [
      listing({ id: "old", registered_at: "2025-01-01" }),
      listing({ id: "new", registered_at: "2026-04-01" }),
      listing({ id: "mid", registered_at: "2025-08-15" }),
    ];
    const result = filterAndSortListings(items, { ...baseArgs, sort: "newest" });
    deepStrictEqual(result.map((l) => l.id), ["new", "mid", "old"]);
  });

  it("sorts by 'installs' descending", () => {
    const items = [
      listing({ id: "a", installs: 10 }),
      listing({ id: "b", installs: 500 }),
      listing({ id: "c", installs: 50 }),
    ];
    const result = filterAndSortListings(items, { ...baseArgs, sort: "installs" });
    deepStrictEqual(result.map((l) => l.id), ["b", "c", "a"]);
  });

  it("sorts by 'rating' descending and treats missing rating as 0", () => {
    const items = [
      listing({ id: "low", rating: 3.5 }),
      listing({ id: "high", rating: 4.9 }),
      listing({ id: "none" }),
    ];
    const result = filterAndSortListings(items, { ...baseArgs, sort: "rating" });
    deepStrictEqual(result.map((l) => l.id), ["high", "low", "none"]);
  });

  it("sorts by 'trending' as a blend of installs, rating, and recency", () => {
    // A high-install old listing should outrank a brand-new zero-install one,
    // because installScore dominates the trending blend.
    const items = [
      listing({
        id: "popular",
        installs: 100_000,
        rating: 4.5,
        registered_at: "2024-01-01",
      }),
      listing({
        id: "fresh-empty",
        installs: 0,
        rating: 0,
        registered_at: today,
      }),
    ];
    const result = filterAndSortListings(items, { ...baseArgs, sort: "trending" });
    strictEqual(result[0].id, "popular");
  });

  it("source filter 'official' keeps only IDs in squadIds (or source 'squad')", () => {
    const items = [
      listing({ id: "bookkeeping" }),
      listing({ id: "community-a", source: "community" }),
      listing({ id: "tagged-houston", source: "squad" }),
    ];
    const result = filterAndSortListings(items, {
      ...baseArgs,
      source: "official",
      squadIds: new Set(["bookkeeping"]),
    });
    const ids = result.map((l) => l.id).sort();
    deepStrictEqual(ids, ["bookkeeping", "tagged-houston"]);
  });

  it("source filter 'community' excludes squadIds and items tagged 'squad'", () => {
    const items = [
      listing({ id: "bookkeeping" }),
      listing({ id: "mock-a", source: "mock" }),
      listing({ id: "comm-b", source: "community" }),
      listing({ id: "tagged-houston", source: "squad" }),
    ];
    const result = filterAndSortListings(items, {
      ...baseArgs,
      source: "community",
      squadIds: new Set(["bookkeeping"]),
    });
    const ids = result.map((l) => l.id).sort();
    deepStrictEqual(ids, ["comm-b", "mock-a"]);
  });

  it("pricing filter 'free' excludes paid listings", () => {
    const items = [
      listing({ id: "f1", pricing: { kind: "free" } }),
      listing({ id: "f2" }),
      listing({
        id: "p1",
        pricing: {
          kind: "paid",
          price_cents: 900,
          currency: "USD",
          model: "one_time",
        },
      }),
    ];
    const result = filterAndSortListings(items, { ...baseArgs, pricing: "free" });
    const ids = result.map((l) => l.id).sort();
    deepStrictEqual(ids, ["f1", "f2"]);
  });

  it("pricing filter 'paid' keeps only paid listings", () => {
    const items = [
      listing({ id: "f1", pricing: { kind: "free" } }),
      listing({
        id: "p1",
        pricing: {
          kind: "paid",
          price_cents: 1900,
          currency: "USD",
          model: "subscription",
        },
      }),
    ];
    const result = filterAndSortListings(items, { ...baseArgs, pricing: "paid" });
    deepStrictEqual(result.map((l) => l.id), ["p1"]);
  });

  it("category filter narrows by exact match", () => {
    const items = [
      listing({ id: "b1", category: "business" }),
      listing({ id: "m1", category: "marketing" }),
      listing({ id: "p1", category: "people" }),
    ];
    const result = filterAndSortListings(items, { ...baseArgs, category: "marketing" });
    deepStrictEqual(result.map((l) => l.id), ["m1"]);
  });

  it("search query matches name, tag, and integration", () => {
    const items = [
      listing({ id: "a", name: "Recruiter Pro" }),
      listing({ id: "b", name: "Other", tags: ["recruiting"] }),
      listing({ id: "c", name: "Inbox", integrations: ["gmail"] }),
      listing({ id: "d", name: "Nope" }),
    ];
    const byName = filterAndSortListings(items, { ...baseArgs, query: "recruiter" });
    const byTag = filterAndSortListings(items, { ...baseArgs, query: "recruiting" });
    const byIntegration = filterAndSortListings(items, { ...baseArgs, query: "gmail" });
    deepStrictEqual(byName.map((l) => l.id), ["a"]);
    deepStrictEqual(byTag.map((l) => l.id), ["b"]);
    deepStrictEqual(byIntegration.map((l) => l.id), ["c"]);
  });

  it("combined source + pricing + query filters compose", () => {
    const items = [
      listing({
        id: "mock-paid-analytics",
        name: "Analytics Wizard",
        source: "community",
        pricing: {
          kind: "paid",
          price_cents: 1900,
          currency: "USD",
          model: "subscription",
        },
      }),
      listing({
        id: "mock-free-content",
        name: "Content Studio",
        source: "community",
        pricing: { kind: "free" },
      }),
      listing({
        id: "bookkeeping",
        name: "Bookkeeping",
        pricing: { kind: "free" },
      }),
    ];
    const result = filterAndSortListings(items, {
      ...baseArgs,
      source: "community",
      pricing: "paid",
      query: "analytics",
      squadIds: new Set(["bookkeeping"]),
    });
    deepStrictEqual(result.map((l) => l.id), ["mock-paid-analytics"]);
  });
});
