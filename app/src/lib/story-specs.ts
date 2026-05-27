/**
 * SDD spec helpers for stories (M7).
 *
 * Specs live in the bound project's repo at `specs/<slug>.md`. The story
 * carries a relative path; this module owns slug generation, the EARS
 * template, and the draft-spec write.
 *
 * No engine changes — uses the existing `writeAgentFile` route which is
 * agnostic about whether the root is an agent or a project repo (the
 * engine's read/write helpers don't validate the root's identity).
 */
import { tauriAgent } from "./tauri";

/** Slug a story title into a stable file name. Stays ASCII-safe so the
 * spec path looks reasonable on every OS and inside git. Falls back to
 * "untitled-spec" when the title slugs to empty (all punctuation, etc.). */
export function slugForSpec(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return base || "untitled-spec";
}

/** Default relative path inside the bound project's repo. */
export function defaultSpecPath(title: string): string {
  return `specs/${slugForSpec(title)}.md`;
}

/** EARS-style template the user can fill in. Pre-quoted so the file
 * loads correctly even if the spec is opened before the user touches
 * it. Mirrors the structure in `claude-method.md §6`. */
export function buildEarsSpecTemplate(opts: {
  title: string;
  description?: string;
}): string {
  const { title, description } = opts;
  return `# Spec: ${title}

## Objective
${description?.trim() || "_One sentence: what problem this solves and for whom._"}

## Scope
- In: _(what this feature DOES do)_
- Out: _(what this feature explicitly does NOT do)_

## Domain / modules touched
- Files / folders: _(e.g. src/auth/, src/sessions/)_
- Must NOT touch: _(modules of other in-flight features)_

## API contract
- Endpoint: METHOD /path
  - Accepts: _(request shape)_
  - Returns: _(response shape)_
  - Errors: _(codes + when)_

## Schema / migrations
- Tables / columns added or modified.
- Destructive? Conflicts with another in-flight branch?

## Integration points
- Events or entities SHARED with other features.
- Exact shape of the shared event / entity.

## Acceptance criteria (EARS)
- WHEN <event>, the system MUST <response>.
- IF <undesired condition>, THEN the system MUST <response>.
- WHILE <state>, the system MUST <requirement>.

## Project rules this touches
- _(reference \`.claude/rules.md\` if any critical rule applies)_

## Expected tests (derived from this spec)
- _(list of cases TDD must cover)_
`;
}

/**
 * Create a draft spec file in the project repo and return the relative
 * path the caller should persist on the story. Refuses to overwrite an
 * existing file — the caller is expected to detect that via
 * `existingSpecPath` and either open it or pass a different slug.
 *
 * On disk: `<repoPath>/specs/<slug>.md`. The directory is created if
 * needed by the engine write path.
 */
export async function draftSpecFile(opts: {
  repoPath: string;
  title: string;
  description?: string;
}): Promise<string> {
  const relPath = defaultSpecPath(opts.title);
  const body = buildEarsSpecTemplate({
    title: opts.title,
    description: opts.description,
  });
  await tauriAgent.writeFile(opts.repoPath, relPath, body);
  return relPath;
}
