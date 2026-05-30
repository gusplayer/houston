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
import { getEngine } from "./engine";
import type { Project, Story } from "@squad/engine-client";
import type { Agent } from "./types";
import { logger } from "./logger";

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

/** Config ids of the protected agents involved in the auto-spec flow.
 * Steve PM authors the spec (planning is his phase); Jeff QA derives the
 * test plan from the EARS acceptance criteria (qa is his phase). Lookup is
 * by config id on the workspace's agent list. */
export const PM_AGENT_CONFIG_ID = "pm-agent";
export const QA_AGENT_CONFIG_ID = "qa-agent";

/** Default relative path inside the bound project's repo for derived tests. */
export function defaultTestsPath(title: string): string {
  return `specs/${slugForSpec(title)}.tests.md`;
}

/** Subset of frontmatter fields the UI cares about. The audit trail (full
 * contributors list, etc.) stays in the file — this is just for listing. */
export interface SpecFrontmatter {
  status?: string;
  story_id?: string;
  author?: string;
  created_at?: string;
  updated_at?: string;
  approved_at?: string;
  approved_by?: string;
  tests_path?: string;
}

/** Read a spec file and parse its YAML frontmatter into a flat record. Only
 * scalar lines are parsed; the `contributors` list and other nested values
 * stay in the file. Returns an empty record if no frontmatter is found. */
export async function readSpecFrontmatter(
  repoPath: string,
  specRelPath: string,
): Promise<{ frontmatter: SpecFrontmatter; raw: string }> {
  const raw = await tauriAgent.readFile(repoPath, specRelPath);
  const fm = parseScalarFrontmatter(raw);
  return { frontmatter: fm, raw };
}

function parseScalarFrontmatter(raw: string): SpecFrontmatter {
  const out: Record<string, string> = {};
  if (!raw.startsWith("---")) return out;
  const closeIdx = raw.indexOf("\n---", 3);
  if (closeIdx < 0) return out;
  const block = raw.slice(3, closeIdx);
  for (const line of block.split("\n")) {
    // Only flat `key: value` lines. Skip nested (`  -`, `key:` empty), the
    // contributors list, etc.
    const m = /^([a-z_]+):\s*(.+)$/i.exec(line);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2].trim();
    if (!value) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Approve a spec: flip status to "approved", set `approved_at` + `approved_by`
 * in the frontmatter, append a contributor entry for the approver, and write
 * the file back. Idempotent — re-approving by the same actor only refreshes
 * the timestamp.
 */
export async function approveSpec(opts: {
  repoPath: string;
  specRelPath: string;
  approver: string;
}): Promise<void> {
  const { repoPath, specRelPath, approver } = opts;
  const { raw } = await readSpecFrontmatter(repoPath, specRelPath);
  const now = new Date().toISOString();
  const updated = updateFrontmatterForApproval(raw, approver, now);
  await tauriAgent.writeFile(repoPath, specRelPath, updated);
}

/**
 * Extract bullet items from the `## Open questions` section of a spec body.
 * Returns an empty array if the section is missing. Used by the SpecsView to
 * surface unresolved questions Steve PM raised at draft time.
 */
export function parseOpenQuestions(raw: string): string[] {
  // Skip past the YAML frontmatter so a body-level heading isn't confused
  // with a frontmatter line.
  const body = stripFrontmatter(raw);
  const lines = body.split("\n");
  let i = 0;
  while (i < lines.length && !/^##\s+Open questions\b/i.test(lines[i])) i++;
  if (i >= lines.length) return [];
  i += 1;
  const out: string[] = [];
  for (; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^##\s/.test(line)) break; // next section
    const m = /^-\s+(.+?)\s*$/.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

/**
 * Remove one open question bullet from a spec file, update `updated_at`, and
 * bump status `draft` → `in_review` once no questions remain. Appends a
 * contributor entry for the resolver. No-op if the question isn't found.
 */
export async function resolveOpenQuestion(opts: {
  repoPath: string;
  specRelPath: string;
  question: string;
  resolver: string;
}): Promise<void> {
  const { repoPath, specRelPath, question, resolver } = opts;
  const raw = await tauriAgent.readFile(repoPath, specRelPath);
  const updated = updateFrontmatterForResolvedQuestion(raw, question, resolver);
  if (updated === raw) return;
  await tauriAgent.writeFile(repoPath, specRelPath, updated);
}

/** Pure helper: remove one bullet from `## Open questions`, refresh
 * `updated_at`, append a contributor, and bump status to `in_review` if the
 * section ends up empty. Exposed for tests. */
export function updateFrontmatterForResolvedQuestion(
  raw: string,
  question: string,
  resolver: string,
): string {
  const fmEnd = raw.indexOf("\n---", 3);
  if (!raw.startsWith("---") || fmEnd < 0) return raw;
  const fmBlock = raw.slice(3, fmEnd);
  const body = raw.slice(fmEnd + 4);

  // 1. Body: remove the matching bullet from `## Open questions`.
  const bodyLines = body.split("\n");
  let inSection = false;
  let bulletRemoved = false;
  const trimmedQ = question.trim();
  const newBodyLines: string[] = [];
  for (const line of bodyLines) {
    if (/^##\s+Open questions\b/i.test(line)) {
      inSection = true;
      newBodyLines.push(line);
      continue;
    }
    if (inSection && /^##\s/.test(line)) {
      inSection = false;
    }
    if (inSection && !bulletRemoved) {
      const m = /^-\s+(.+?)\s*$/.exec(line);
      if (m && m[1].trim() === trimmedQ) {
        bulletRemoved = true;
        continue; // drop this line
      }
    }
    newBodyLines.push(line);
  }
  if (!bulletRemoved) return raw;

  // 2. If the section has no remaining bullets, drop the section heading.
  const removeEmptySection = (lines: string[]): string[] => {
    const out: string[] = [];
    for (let j = 0; j < lines.length; j += 1) {
      if (/^##\s+Open questions\b/i.test(lines[j])) {
        // peek until the next heading or EOF; if no bullet, skip.
        let hasBullet = false;
        let k = j + 1;
        for (; k < lines.length; k += 1) {
          if (/^##\s/.test(lines[k])) break;
          if (/^-\s+/.test(lines[k])) {
            hasBullet = true;
            break;
          }
        }
        if (!hasBullet) {
          // skip up to (but not including) the next heading
          while (k < lines.length && !/^##\s/.test(lines[k])) k += 1;
          j = k - 1;
          continue;
        }
      }
      out.push(lines[j]);
    }
    return out;
  };
  const finalBodyLines = removeEmptySection(newBodyLines);
  const sectionGone = !finalBodyLines.some((l) => /^##\s+Open questions\b/i.test(l));

  // 3. Frontmatter: refresh updated_at, append a contributor entry, and bump
  //    status if all questions resolved.
  const fmLines = fmBlock.split("\n");
  const now = new Date().toISOString();
  const setScalar = (key: string, value: string) => {
    const idx = fmLines.findIndex((l) => l.startsWith(`${key}:`));
    const line = `${key}: ${value}`;
    if (idx >= 0) fmLines[idx] = line;
    else fmLines.push(line);
  };
  setScalar("updated_at", now);
  if (sectionGone) {
    const statusIdx = fmLines.findIndex((l) => l.startsWith("status:"));
    if (statusIdx >= 0 && /status:\s*draft/.test(fmLines[statusIdx])) {
      fmLines[statusIdx] = "status: in_review";
    }
  }
  const contribHeader = fmLines.findIndex((l) => l.startsWith("contributors:"));
  if (contribHeader >= 0) {
    let insertAt = contribHeader + 1;
    while (insertAt < fmLines.length && fmLines[insertAt].startsWith("  -")) {
      insertAt += 1;
    }
    fmLines.splice(
      insertAt,
      0,
      `  - { agent: ${resolver}, at: ${now}, role: resolver }`,
    );
  }

  return `---${fmLines.join("\n")}\n---${finalBodyLines.join("\n")}`;
}

function stripFrontmatter(raw: string): string {
  if (!raw.startsWith("---")) return raw;
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return raw;
  return raw.slice(end + 4);
}

/** Pure helper: rewrite the frontmatter block of `raw` to reflect approval.
 * Exported only for tests; consumers should use [`approveSpec`]. */
export function updateFrontmatterForApproval(
  raw: string,
  approver: string,
  nowIso: string,
): string {
  if (!raw.startsWith("---")) return raw;
  const closeIdx = raw.indexOf("\n---", 3);
  if (closeIdx < 0) return raw;
  const blockStart = 3;
  const blockEnd = closeIdx;
  const rest = raw.slice(closeIdx + 4); // skip "\n---"
  const original = raw.slice(blockStart, blockEnd);
  const lines = original.split("\n");

  const setScalar = (key: string, value: string) => {
    const idx = lines.findIndex((l) => l.startsWith(`${key}:`));
    const line = `${key}: ${value}`;
    if (idx >= 0) lines[idx] = line;
    else lines.push(line);
  };

  setScalar("status", "approved");
  setScalar("approved_at", nowIso);
  setScalar("approved_by", approver);
  setScalar("updated_at", nowIso);

  // Append a contributor entry for the approver. Contributors are listed
  // under `contributors:` followed by `  - {…}` lines; we append a new entry
  // just after the last one, or right after the `contributors:` header.
  const contribHeader = lines.findIndex((l) => l.startsWith("contributors:"));
  if (contribHeader >= 0) {
    let insertAt = contribHeader + 1;
    while (insertAt < lines.length && lines[insertAt].startsWith("  -")) {
      insertAt += 1;
    }
    lines.splice(
      insertAt,
      0,
      `  - { agent: ${approver}, at: ${nowIso}, role: approver }`,
    );
  } else {
    lines.push("contributors:");
    lines.push(`  - { agent: ${approver}, at: ${nowIso}, role: approver }`);
  }

  return `---${lines.join("\n")}\n---${rest}`;
}

/** YAML frontmatter for an auto-drafted spec. Includes a `tests_path`
 * pointer when QA already drafted the matching tests file in the same run. */
function buildSpecFrontmatter(opts: {
  storyId: string;
  author: string;
  createdAt: string;
  testsPath?: string;
}): string {
  const lines = [
    "---",
    `story_id: ${opts.storyId}`,
    "status: draft",
    `author: ${opts.author}`,
    `created_at: ${opts.createdAt}`,
    `updated_at: ${opts.createdAt}`,
    "contributors:",
    `  - { agent: ${opts.author}, at: ${opts.createdAt}, role: author }`,
  ];
  if (opts.testsPath) lines.push(`tests_path: ${opts.testsPath}`);
  lines.push("---", "");
  return lines.join("\n");
}

/** YAML frontmatter for the derived tests file. */
function buildTestsFrontmatter(opts: {
  storyId: string;
  specPath: string;
  author: string;
  createdAt: string;
}): string {
  return [
    "---",
    `story_id: ${opts.storyId}`,
    `spec_path: ${opts.specPath}`,
    "status: draft",
    `author: ${opts.author}`,
    `created_at: ${opts.createdAt}`,
    `updated_at: ${opts.createdAt}`,
    "contributors:",
    `  - { agent: ${opts.author}, at: ${opts.createdAt}, role: author }`,
    "---",
    "",
  ].join("\n");
}

/**
 * Auto-draft an EARS spec for a freshly-created story. Resolves the PM agent
 * (Steve PM by convention) and shells to his configured LLM via the engine.
 * No-ops if there's no bound project or no PM agent in the workspace. Errors
 * are swallowed and logged — failing here must not block story creation.
 *
 * Returns the relative `specPath` the caller should persist on the story.
 */
export async function autoDraftSpecForStory(opts: {
  story: Story;
  agents: Agent[];
  projects: Project[];
}): Promise<string | null> {
  const { story, agents, projects } = opts;
  if (!story.projectId) return null;
  const project = projects.find((p) => p.id === story.projectId);
  if (!project?.repoPath) return null;
  const pm = agents.find((a) => a.configId === PM_AGENT_CONFIG_ID);
  if (!pm) return null;

  try {
    // 1) Steve PM drafts the EARS spec body.
    const { content: specBody } = await getEngine().draftSpec(
      story.title,
      story.description ?? "",
      { agentPath: pm.folderPath },
    );
    const specRelPath = defaultSpecPath(story.title);
    const createdAt = new Date().toISOString();

    // 2) Jeff QA derives the TDD test plan from the spec body (best-effort).
    //    Missing QA / failed derivation → spec still ships without tests_path.
    const qa = agents.find((a) => a.configId === QA_AGENT_CONFIG_ID);
    let testsRelPath: string | undefined;
    if (qa) {
      try {
        const { content: testsBody } = await getEngine().draftTests(
          story.title,
          specBody,
          { agentPath: qa.folderPath },
        );
        testsRelPath = defaultTestsPath(story.title);
        const testsFm = buildTestsFrontmatter({
          storyId: story.id,
          specPath: specRelPath,
          author: QA_AGENT_CONFIG_ID,
          createdAt,
        });
        await tauriAgent.writeFile(
          project.repoPath,
          testsRelPath,
          `${testsFm}${testsBody}\n`,
        );
      } catch (err) {
        logger.error(`[story-specs] tests derivation failed for ${story.id}: ${err}`);
        testsRelPath = undefined;
      }
    }

    // 3) Write the spec, pointing at the tests file when QA produced one.
    const specFm = buildSpecFrontmatter({
      storyId: story.id,
      author: PM_AGENT_CONFIG_ID,
      createdAt,
      testsPath: testsRelPath,
    });
    await tauriAgent.writeFile(
      project.repoPath,
      specRelPath,
      `${specFm}${specBody}\n`,
    );
    return specRelPath;
  } catch (err) {
    logger.error(`[story-specs] auto-draft failed for ${story.id}: ${err}`);
    return null;
  }
}
