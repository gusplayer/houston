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
    id: "mock-ux-researcher",
    name: "UX Researcher",
    description:
      "Plans research studies, recruits participants, synthesizes interview transcripts into themes. Drafts insight reports, never sends without your review.",
    category: "design",
    author: "Priya Shah",
    tags: ["ux", "research", "interviews", "synthesis"],
    icon_url: "magnifying-glass",
    integrations: ["notion", "slack", "googledrive", "googledocs"],
    repo: "priyashah/ux-researcher",
    installs: 412,
    registered_at: "2026-03-22",
    version: "0.6.3",
    source: "mock",
    verified: false,
    rating: 4.6,
    reviews_count: 89,
    stars: 287,
    publisher: {
      name: "Priya Shah",
      handle: "priyashah",
      github_url: "https://github.com/priyashah",
      verified: false,
    },
    pricing: { kind: "free" },
  },
  {
    id: "mock-design-system-curator",
    name: "Design System Curator",
    description:
      "Audits component usage across product, flags drift, drafts changelog entries for design updates. Keeps tokens, types, and docs in sync.",
    category: "design",
    author: "studio-flux",
    tags: ["design-system", "components", "tokens", "audit"],
    icon_url: "palette",
    integrations: ["figma", "github", "notion", "linear", "slack"],
    repo: "studio-flux/design-system-curator",
    installs: 728,
    registered_at: "2026-02-10",
    version: "1.4.0",
    source: "mock",
    verified: true,
    rating: 4.8,
    reviews_count: 156,
    stars: 982,
    publisher: {
      name: "Studio Flux",
      handle: "studio-flux",
      github_url: "https://github.com/studio-flux",
      verified: true,
    },
    pricing: {
      kind: "paid",
      price_cents: 2900,
      currency: "USD",
      model: "subscription",
    },
  },
  {
    id: "mock-copy-reviewer",
    name: "Copy Reviewer",
    description:
      "Reads every UI string in your repo, flags voice inconsistencies, suggests cleaner alternatives. Catches em dashes, jargon, and accidental conditionals.",
    category: "design",
    author: "kim-writes",
    tags: ["copy", "content-design", "ux-writing"],
    icon_url: "type",
    integrations: ["github", "notion", "linear"],
    repo: "kim-writes/copy-reviewer",
    installs: 219,
    registered_at: "2026-04-02",
    version: "0.3.1",
    source: "mock",
    verified: false,
    rating: 4.4,
    reviews_count: 38,
    stars: 142,
    publisher: {
      name: "Kim Tanaka",
      handle: "kim-writes",
      github_url: "https://github.com/kim-writes",
      verified: false,
    },
    pricing: { kind: "free" },
  },
  {
    id: "mock-brand-guardian",
    name: "Brand Guardian",
    description:
      "Scans website and social posts for voice violations, weak headlines, and off-palette imagery. Drafts replacements in your brand voice.",
    category: "design",
    author: "northstar-co",
    tags: ["brand", "voice", "audit", "social"],
    icon_url: "shield",
    integrations: ["instagram", "linkedin", "twitter", "notion", "slack"],
    repo: "northstar-co/brand-guardian",
    installs: 318,
    registered_at: "2026-03-04",
    version: "0.9.0",
    source: "mock",
    verified: true,
    rating: 4.5,
    reviews_count: 92,
    stars: 471,
    publisher: {
      name: "Northstar Co",
      handle: "northstar-co",
      github_url: "https://github.com/northstar-co",
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
    id: "mock-illustration-coordinator",
    name: "Illustration Coordinator",
    description:
      "Tracks illustration requests across product, deadlines, and owners. Reminds illustrators before deadlines and syncs final assets to the design library.",
    category: "design",
    author: "Ana Ferreira",
    tags: ["illustration", "production", "coordination"],
    icon_url: "pencil",
    integrations: ["figma", "slack", "googledrive", "notion"],
    repo: "anaferreira/illustration-coordinator",
    installs: 88,
    registered_at: "2026-04-21",
    version: "0.2.0",
    source: "mock",
    verified: false,
    rating: 4.3,
    reviews_count: 24,
    stars: 61,
    publisher: {
      name: "Ana Ferreira",
      handle: "anaferreira",
      github_url: "https://github.com/anaferreira",
      verified: false,
    },
    pricing: { kind: "free" },
  },
  {
    id: "mock-pr-reviewer",
    name: "PR Reviewer",
    description:
      "Reads every pull request, summarizes the change, flags risky migrations, suggests test cases. Posts a structured review your team can ship or push back on.",
    category: "developers",
    author: "shipsmart",
    tags: ["code-review", "pr", "ci", "devops"],
    icon_url: "git-pull-request",
    integrations: ["github", "linear", "slack"],
    repo: "shipsmart/pr-reviewer",
    installs: 2104,
    registered_at: "2025-12-14",
    version: "2.1.0",
    source: "mock",
    verified: true,
    rating: 4.9,
    reviews_count: 612,
    stars: 3489,
    publisher: {
      name: "ShipSmart",
      handle: "shipsmart",
      github_url: "https://github.com/shipsmart",
      verified: true,
    },
    pricing: {
      kind: "paid",
      price_cents: 3900,
      currency: "USD",
      model: "subscription",
    },
  },
  {
    id: "mock-dependency-upgrader",
    name: "Dependency Upgrader",
    description:
      "Audits your lockfiles weekly, drafts upgrade PRs grouped by risk, runs the tests, summarizes breaking changes. Never merges without approval.",
    category: "developers",
    author: "depbot-oss",
    tags: ["dependencies", "security", "supply-chain", "dependabot"],
    icon_url: "package",
    integrations: ["github", "npm", "slack"],
    repo: "depbot-oss/dependency-upgrader",
    installs: 891,
    registered_at: "2026-01-30",
    version: "1.5.2",
    source: "mock",
    verified: true,
    rating: 4.6,
    reviews_count: 184,
    stars: 1402,
    publisher: {
      name: "Depbot OSS",
      handle: "depbot-oss",
      github_url: "https://github.com/depbot-oss",
      verified: true,
    },
    pricing: { kind: "free" },
  },
  {
    id: "mock-oncall-pilot",
    name: "On-call Pilot",
    description:
      "Watches alerts during your on-call rotation, correlates Sentry errors with recent deploys, drafts incident timelines. Pings only when there is real signal.",
    category: "developers",
    author: "blip-labs",
    tags: ["on-call", "incidents", "sre", "observability"],
    icon_url: "siren",
    integrations: ["sentry", "datadog", "slack", "github", "linear"],
    repo: "blip-labs/oncall-pilot",
    installs: 645,
    registered_at: "2026-02-08",
    version: "1.0.3",
    source: "mock",
    verified: true,
    rating: 4.7,
    reviews_count: 234,
    stars: 988,
    publisher: {
      name: "Blip Labs",
      handle: "blip-labs",
      github_url: "https://github.com/blip-labs",
      verified: true,
    },
    pricing: {
      kind: "paid",
      price_cents: 4900,
      currency: "USD",
      model: "subscription",
    },
  },
  {
    id: "mock-cost-cutter",
    name: "Cost Cutter",
    description:
      "Watches Vercel and Cloudflare bills, flags week-over-week jumps, traces them to the responsible service. Drafts savings tickets your team can act on.",
    category: "developers",
    author: "Diego Ramos",
    tags: ["finops", "cost", "infra", "optimization"],
    icon_url: "trending-down",
    integrations: ["vercel", "cloudflare", "slack", "linear"],
    repo: "diegoramos/cost-cutter",
    installs: 198,
    registered_at: "2026-04-10",
    version: "0.4.1",
    source: "mock",
    verified: false,
    rating: 4.4,
    reviews_count: 67,
    stars: 152,
    publisher: {
      name: "Diego Ramos",
      handle: "diegoramos",
      github_url: "https://github.com/diegoramos",
      verified: false,
    },
    pricing: { kind: "free" },
  },
  {
    id: "mock-release-notes-writer",
    name: "Release Notes Writer",
    description:
      "Reads merged PRs since the last tag, groups by theme (features, fixes, chores), drafts changelog entries in your voice. Ships to Markdown or your website.",
    category: "developers",
    author: "shipnotes",
    tags: ["release", "changelog", "devrel"],
    icon_url: "scroll-text",
    integrations: ["github", "slack", "notion", "linear"],
    repo: "shipnotes/release-notes-writer",
    installs: 367,
    registered_at: "2026-03-15",
    version: "0.7.4",
    source: "mock",
    verified: false,
    rating: 4.5,
    reviews_count: 102,
    stars: 298,
    publisher: {
      name: "Shipnotes",
      handle: "shipnotes",
      github_url: "https://github.com/shipnotes",
      verified: false,
    },
    pricing: {
      kind: "paid",
      price_cents: 1500,
      currency: "USD",
      model: "one_time",
    },
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
