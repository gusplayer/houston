/**
 * Community discovery for the user library — no Squad-owned server.
 *
 * Each library kind maps to a GitHub topic. Anyone in the world can
 * publish a primitive by pushing a repo with the right contents at root
 * and adding the topic. We query GitHub's public search API directly;
 * the engine handles install.
 *
 * Topic conventions:
 * - skill → `squad-skill`
 * - role  → `squad-role`
 * - mcp   → `mcp-server` (Anthropic ecosystem convention)
 *
 * GitHub limits unauthenticated search to 10 req/min. TanStack Query
 * caches results client-side so the user does not hit the limit during
 * normal browsing.
 */

import type { LibraryKind } from "@squad/engine-client";

export interface CatalogEntry {
  /** Stable identifier — `owner/repo` so re-installs are detectable. */
  id: string;
  /** Card title — falls back to repo name when description is empty. */
  name: string;
  description: string;
  url: string;
  owner: string;
  repo: string;
  stars: number;
  updatedAt: string;
}

const TOPIC_BY_KIND: Record<LibraryKind, string> = {
  skill: "squad-skill",
  role: "squad-role",
  mcp: "mcp-server",
};

interface GithubSearchItem {
  full_name: string;
  name: string;
  description: string | null;
  html_url: string;
  owner: { login: string };
  stargazers_count: number;
  updated_at: string;
}

interface GithubSearchResponse {
  items: GithubSearchItem[];
}

export async function searchCommunityCatalog(
  kind: LibraryKind,
  query: string,
): Promise<CatalogEntry[]> {
  const topic = TOPIC_BY_KIND[kind];
  const q = query.trim()
    ? `topic:${topic} ${query.trim()}`
    : `topic:${topic}`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(
    q,
  )}&per_page=30&sort=stars&order=desc`;

  const resp = await fetch(url, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!resp.ok) {
    throw new Error(`GitHub search failed (${resp.status})`);
  }
  const body = (await resp.json()) as GithubSearchResponse;
  return body.items.map((item) => ({
    id: item.full_name,
    name: item.description ? item.name : item.full_name,
    description: item.description ?? "",
    url: item.html_url,
    owner: item.owner.login,
    repo: item.name,
    stars: item.stargazers_count,
    updatedAt: item.updated_at,
  }));
}
