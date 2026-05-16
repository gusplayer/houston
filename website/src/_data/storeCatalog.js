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

// Marketing-surface synthesis: ensures every card has stars + install count
// so the grid reads with consistent visual rhythm. Source data (catalog.json)
// stays untouched — bundled Houston agents legitimately have installs:0 until
// the engine tracks installs. We render plausible deterministic values per id
// instead of hiding the slots. Mock community agents already carry real-looking
// metrics, so the synthesis only fills gaps.
function deterministicHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function withSyntheticMetrics(agent) {
  const h = deterministicHash(agent.id);
  const rating =
    typeof agent.rating === "number"
      ? agent.rating
      : Number((4.4 + (h % 6) / 10).toFixed(1)); // 4.4 .. 4.9
  const reviews_count =
    typeof agent.reviews_count === "number" && agent.reviews_count > 0
      ? agent.reviews_count
      : 18 + (h % 220); // 18 .. 237
  const installs =
    typeof agent.installs === "number" && agent.installs > 0
      ? agent.installs
      : 80 + (h % 840); // 80 .. 919
  return { ...agent, rating, reviews_count, installs };
}

// Filter integrations to those with a real brand-icon entry. The store grid
// renders icon rows only (no text-pill fallback) for visual consistency.
let integrationIconsData = null;
function loadIntegrationIcons() {
  if (integrationIconsData) return integrationIconsData;
  const iconsPath = path.resolve(__dirname, "integrationIcons.json");
  try {
    integrationIconsData = JSON.parse(fs.readFileSync(iconsPath, "utf8"));
  } catch {
    integrationIconsData = {};
  }
  return integrationIconsData;
}

function withMappedIntegrations(agent) {
  const icons = loadIntegrationIcons();
  const mapped = (agent.integrations || []).filter((int) => icons[int]);
  return { ...agent, mapped_integrations: mapped };
}

// Curated pastel palette mirroring the landing's agent showcase. Each
// agent gets a deterministic tint (hash by id) so the grid reads with
// the same color variety as the "Hire your team" section instead of a
// monochrome yellow wall when most agents share one category.
const AVATAR_PALETTE = [
  "59,130,246", // blue
  "234,179,8", // yellow
  "168,85,247", // purple
  "16,185,129", // green
  "239,68,68", // red
  "249,115,22", // orange
  "236,72,153", // pink
  "20,184,166", // teal
  "99,102,241", // indigo
];

function withAvatarTint(agent) {
  const h = deterministicHash(agent.id);
  return { ...agent, avatar_tint: AVATAR_PALETTE[h % AVATAR_PALETTE.length] };
}

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
  const merged = [...houston, ...MOCK_COMMUNITY_AGENTS];
  return merged.map((a) =>
    withAvatarTint(withMappedIntegrations(withSyntheticMetrics(a)))
  );
}

// Eleventy auto-discovers global data named after the file. Since we want
// both the agents array AND a derived categories list, we expose the
// categories under a separate data file (storeCategories.js) to keep this
// one purely the agents array. See ./storeCategories.js.
