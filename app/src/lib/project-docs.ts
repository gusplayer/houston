/**
 * I.1 — Project docs.
 *
 * Markdown files living under `.squad/docs/` at two scopes:
 *
 *   - Workspace-global: `<workspace>/.squad/docs/*.md` — every agent in
 *     the workspace can read them. Frontmatter `audience` filters which
 *     roles include the doc in their prompt context.
 *   - Per-agent: `<agent>/.squad/docs/*.md` — private to one agent.
 *
 * Both scopes are managed via the same primitives — we just hand the
 * caller the appropriate root path. The engine consumes both at session
 * start (workspace first, then agent) and concatenates them into the
 * system prompt.
 *
 * Frontmatter is optional YAML-ish (the parser is intentionally minimal
 * — full YAML pulls a dep we don't need for two fields).
 */
import { tauriAgent } from "./tauri";

const DOCS_DIR = ".squad/docs";
const INDEX_FILE = `${DOCS_DIR}/index.json`;

export interface DocFrontmatter {
  /** Display title; falls back to the filename when absent. */
  title?: string;
  /** Built-in role IDs that should receive this doc in their prompt.
   * Empty / undefined = universal (every agent gets it). */
  audience?: string[];
}

export interface ProjectDoc {
  /** Filename without `.md`, used as the storage key + URL slug. */
  slug: string;
  /** Parsed frontmatter — title, audience, etc. */
  frontmatter: DocFrontmatter;
  /** Markdown body, frontmatter already stripped. */
  body: string;
  /** Raw on-disk contents (frontmatter + body) — useful for editors. */
  raw: string;
}

// ── Frontmatter ─────────────────────────────────────────────────────────

const FENCE = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;

/** Pull simple `key: value` and `key: [a, b, c]` pairs out of YAML-ish. */
export function parseFrontmatter(raw: string): { fm: DocFrontmatter; body: string } {
  const match = raw.match(FENCE);
  if (!match) return { fm: {}, body: raw };
  const block = match[1];
  const body = raw.slice(match[0].length);
  const fm: DocFrontmatter = {};
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf(":");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key === "title") {
      fm.title = stripQuotes(value);
    } else if (key === "audience") {
      fm.audience = parseInlineList(value);
    }
  }
  return { fm, body };
}

function stripQuotes(v: string): string {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function parseInlineList(v: string): string[] {
  if (!v.startsWith("[") || !v.endsWith("]")) return [];
  return v
    .slice(1, -1)
    .split(",")
    .map((s) => stripQuotes(s.trim()))
    .filter(Boolean);
}

export function serializeFrontmatter(fm: DocFrontmatter, body: string): string {
  const hasFm = !!fm.title || (fm.audience && fm.audience.length > 0);
  if (!hasFm) return body;
  const lines: string[] = ["---"];
  if (fm.title) lines.push(`title: ${JSON.stringify(fm.title)}`);
  if (fm.audience && fm.audience.length > 0) {
    lines.push(`audience: [${fm.audience.map((a) => JSON.stringify(a)).join(", ")}]`);
  }
  lines.push("---", "");
  return lines.join("\n") + body;
}

// ── I/O ────────────────────────────────────────────────────────────────

/** Maintain an `index.json` so listing is one read instead of a directory
 * scan (we don't have a list-files engine route for arbitrary roots). */
interface DocIndex {
  slugs: string[];
}

async function readIndex(rootPath: string): Promise<DocIndex> {
  try {
    const raw = await tauriAgent.readFile(rootPath, INDEX_FILE);
    if (!raw) return { slugs: [] };
    const parsed = JSON.parse(raw) as DocIndex;
    return { slugs: Array.isArray(parsed.slugs) ? parsed.slugs : [] };
  } catch {
    return { slugs: [] };
  }
}

async function writeIndex(rootPath: string, index: DocIndex): Promise<void> {
  await tauriAgent.writeFile(rootPath, INDEX_FILE, JSON.stringify(index, null, 2));
}

export async function listDocs(rootPath: string): Promise<ProjectDoc[]> {
  const { slugs } = await readIndex(rootPath);
  const out: ProjectDoc[] = [];
  for (const slug of slugs) {
    try {
      const raw = await tauriAgent.readFile(rootPath, `${DOCS_DIR}/${slug}.md`);
      if (raw == null) continue;
      const { fm, body } = parseFrontmatter(raw);
      out.push({ slug, frontmatter: fm, body, raw });
    } catch {
      // Orphan in the index — keep going; the user can re-create the file.
    }
  }
  return out;
}

export async function saveDoc(
  rootPath: string,
  slug: string,
  frontmatter: DocFrontmatter,
  body: string,
): Promise<void> {
  const content = serializeFrontmatter(frontmatter, body);
  await tauriAgent.writeFile(rootPath, `${DOCS_DIR}/${slug}.md`, content);
  const index = await readIndex(rootPath);
  if (!index.slugs.includes(slug)) {
    await writeIndex(rootPath, { slugs: [...index.slugs, slug] });
  }
}

export async function deleteDoc(rootPath: string, slug: string): Promise<void> {
  // Tauri agent files API has no delete; rewriting with empty content
  // marks it as gone for the consumer. Drop from the index either way.
  await tauriAgent.writeFile(rootPath, `${DOCS_DIR}/${slug}.md`, "");
  const index = await readIndex(rootPath);
  await writeIndex(rootPath, {
    slugs: index.slugs.filter((s) => s !== slug),
  });
}

// ── Audience filtering ─────────────────────────────────────────────────

/** Does this doc apply to an agent with the given role id?
 * Universal (no audience or empty audience) → always yes.
 * Tagged → only when the role is in the list. */
export function docMatchesRole(doc: ProjectDoc, roleId: string): boolean {
  const aud = doc.frontmatter.audience;
  if (!aud || aud.length === 0) return true;
  return aud.includes(roleId);
}

// ── Templates ──────────────────────────────────────────────────────────

export interface DocTemplate {
  slug: string;
  title: string;
  frontmatter: DocFrontmatter;
  body: string;
}

/** Starter templates for the most common docs. Used by the "+ New doc"
 * picker so a new workspace gets useful scaffolding instead of a blank
 * editor. */
export const DOC_TEMPLATES: readonly DocTemplate[] = [
  {
    slug: "architecture",
    title: "Architecture",
    frontmatter: { title: "Architecture" },
    body: `# Architecture

## Overview
What the system does, at one paragraph of resolution.

## Modules
- Module A — what it owns, key files
- Module B — …

## Data flow
1. Entry point
2. …

## Boundaries we deliberately keep
- …
`,
  },
  {
    slug: "tech-stack",
    title: "Tech Stack",
    frontmatter: { title: "Tech Stack" },
    body: `# Tech Stack

## Languages / runtimes
- …

## Key libraries
- …

## Build / deploy
- …

## Versions we pin
- …
`,
  },
  {
    slug: "rules",
    title: "Rules",
    frontmatter: { title: "Rules" },
    body: `# Project rules

Hard rules every contributor (human or agent) follows.

- …
- …
`,
  },
  {
    slug: "practices",
    title: "Best practices",
    frontmatter: { title: "Best practices" },
    body: `# Best practices

Soft rules — guidelines, not absolutes.

- …
`,
  },
  {
    slug: "qa-criteria",
    title: "QA criteria",
    frontmatter: { title: "QA criteria", audience: ["qa-agent"] },
    body: `# QA criteria

What QA validates before a story is marked Done.

## Coverage targets
- …

## Failure modes we always exercise
- …

## Reproducibility
- …
`,
  },
  {
    slug: "review-criteria",
    title: "Code review criteria",
    frontmatter: {
      title: "Code review criteria",
      audience: ["cto-agent", "backend-lead-agent", "frontend-lead-agent", "mobile-lead-agent"],
    },
    body: `# Code review criteria

What reviewers look for before approving a PR.

## Architecture fit
- …

## Code quality
- …

## Test coverage
- …

## Security / data
- …
`,
  },
] as const;
