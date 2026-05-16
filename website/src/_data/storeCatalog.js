// Build-time data for the Store pages.
//
// Merges:
//   1. The 8 official Houston agents loaded from /store/catalog.json
//      (at the repo root). Each one is tagged with source: "houston"
//      and pricing: { kind: "free" }.
//   2. 6 hardcoded mock community agents, inlined verbatim from
//      app/src/components/store/mock-catalog.ts. Duplication is
//      intentional and temporary; once the real community catalog
//      endpoint ships, this file disappears and the engine drives it.
//
// If catalog.json cannot be read (e.g., on a slim deploy), we log a
// warning and fall back to an empty official list. The mock community
// list always renders so the design stays visible.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// website/src/_data -> ../../../store/catalog.json
const CATALOG_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "store",
  "catalog.json"
);

const MOCK_COMMUNITY_AGENTS = [
  {
    id: "mock-recruiter-pro",
    name: "Recruiter Pro",
    description:
      "Source candidates from LinkedIn, score resumes, schedule first-round screens. Drafts personalized outreach but never sends without your review.",
    category: "people",
    author: "Lisa Martinez",
    tags: ["recruiting", "hiring", "linkedin", "sourcing"],
    icon_url: "users",
    integrations: ["linkedin", "gmail", "googlecalendar", "notion"],
    repo: "lmartinez/recruiter-pro",
    installs: 234,
    registered_at: "2026-03-12",
    version: "0.8.1",
    source: "mock",
    verified: false,
    rating: 4.7,
    reviews_count: 41,
    stars: 312,
    publisher: {
      name: "Lisa Martinez",
      handle: "lmartinez",
      github_url: "https://github.com/lmartinez",
      verified: false,
    },
    pricing: { kind: "free" },
  },
  {
    id: "mock-content-studio",
    name: "Content Studio",
    description:
      "Plan a month of social content, write captions in your voice, schedule drafts to Buffer. Audits performance weekly and proposes next experiments.",
    category: "marketing",
    author: "marketdev",
    tags: ["content", "social", "buffer", "scheduling"],
    icon_url: "megaphone",
    integrations: ["buffer", "instagram", "linkedin", "twitter", "notion"],
    repo: "marketdev/content-studio",
    installs: 1892,
    registered_at: "2026-01-08",
    version: "1.2.0",
    source: "mock",
    verified: true,
    rating: 4.5,
    reviews_count: 217,
    stars: 1840,
    publisher: {
      name: "MarketDev Labs",
      handle: "marketdev",
      github_url: "https://github.com/marketdev",
      verified: true,
    },
    pricing: { kind: "free" },
  },
  {
    id: "mock-analytics-wizard",
    name: "Analytics Wizard",
    description:
      "Pull metrics from PostHog, Mixpanel, GA4. Builds weekly KPI digests, flags anomalies, drafts answers to investor questions.",
    category: "business",
    author: "data-team",
    tags: ["analytics", "metrics", "kpi", "posthog", "mixpanel"],
    icon_url: "chart-bar",
    integrations: ["posthog", "mixpanel", "googleanalytics", "slack", "notion"],
    repo: "data-team-oss/analytics-wizard",
    installs: 3401,
    registered_at: "2025-11-22",
    version: "2.4.3",
    source: "mock",
    verified: true,
    rating: 4.8,
    reviews_count: 488,
    stars: 4210,
    publisher: {
      name: "Data Team OSS",
      handle: "data-team",
      github_url: "https://github.com/data-team-oss",
      verified: true,
    },
    pricing: {
      kind: "paid",
      price_cents: 1900,
      currency: "USD",
      model: "subscription",
    },
  },
  {
    id: "mock-invoice-hunter",
    name: "Invoice Hunter",
    description:
      "Chase unpaid invoices on a polite schedule. Writes follow-ups, flags risky accounts, tracks days outstanding. Never sends without approval.",
    category: "business",
    author: "saastools",
    tags: ["finance", "invoicing", "ar", "collections"],
    icon_url: "receipt",
    integrations: ["stripe", "quickbooks", "gmail", "outlook"],
    repo: "saastools/invoice-hunter",
    installs: 567,
    registered_at: "2026-02-19",
    version: "0.5.4",
    source: "mock",
    verified: false,
    rating: 4.3,
    reviews_count: 73,
    stars: 421,
    publisher: {
      name: "SaaS Tools",
      handle: "saastools",
      github_url: "https://github.com/saastools",
      verified: false,
    },
    pricing: {
      kind: "paid",
      price_cents: 900,
      currency: "USD",
      model: "one_time",
    },
  },
  {
    id: "mock-meeting-scribe",
    name: "Meeting Scribe",
    description:
      "Joins your calls via Fireflies, writes structured notes, extracts action items, follows up the next day to make sure they happen.",
    category: "operations",
    author: "Ana López",
    tags: ["meetings", "notes", "fireflies", "productivity"],
    icon_url: "notebook",
    integrations: ["fireflies", "gong", "notion", "slack", "googlecalendar"],
    repo: "analopez/meeting-scribe",
    installs: 8234,
    registered_at: "2025-09-04",
    version: "3.1.2",
    source: "mock",
    verified: true,
    rating: 4.9,
    reviews_count: 1124,
    stars: 9870,
    publisher: {
      name: "Ana López",
      handle: "analopez",
      github_url: "https://github.com/analopez",
      verified: true,
    },
    pricing: { kind: "free" },
  },
  {
    id: "mock-customer-insights",
    name: "Customer Insights",
    description:
      "Reads every support ticket, every Gong call, every churned account. Surfaces patterns weekly so product and CS stay ahead of churn.",
    category: "business",
    author: "growthhacker",
    tags: ["customer-success", "voc", "research", "gong"],
    icon_url: "magnifying-glass",
    integrations: ["gong", "intercom", "zendesk", "notion", "slack"],
    repo: "growthhacker/customer-insights",
    installs: 124,
    registered_at: "2026-04-30",
    version: "0.2.1",
    source: "mock",
    verified: false,
    rating: 4.2,
    reviews_count: 18,
    stars: 87,
    publisher: {
      name: "Growth Hacker",
      handle: "growthhacker",
      github_url: "https://github.com/growthhacker",
      verified: false,
    },
    pricing: { kind: "free" },
  },
];

function loadHoustonAgents() {
  try {
    const raw = fs.readFileSync(CATALOG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const agents = Array.isArray(parsed.agents) ? parsed.agents : [];
    return agents.map((a) => ({
      ...a,
      source: "houston",
      pricing: { kind: "free" },
    }));
  } catch (err) {
    console.warn(
      `[storeCatalog] failed to read ${CATALOG_PATH}: ${err.message}. Falling back to mock community only.`
    );
    return [];
  }
}

export default function () {
  const houston = loadHoustonAgents();
  return [...houston, ...MOCK_COMMUNITY_AGENTS];
}

// Eleventy auto-discovers global data named after the file. Since we want
// both the agents array AND a derived categories list, we expose the
// categories under a separate data file (storeCategories.js) to keep this
// one purely the agents array. See ./storeCategories.js.
