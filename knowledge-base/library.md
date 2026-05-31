# Library — user-owned primitives

Squad ships three independent libraries the user can browse, install, and
assign to agents. Each is a different primitive but follows the same UX
pattern so the user learns one and knows all three.

| Kind  | What it is                          | Topic for discovery | Assign target           |
|-------|--------------------------------------|---------------------|--------------------------|
| skill | A `SKILL.md` procedure              | `squad-skill`       | `<agent>/.agents/skills/`|
| role  | A role agent (`squad.json` + CLAUDE.md) | `squad-role`    | Hired via recruiter (M4) |
| mcp   | A Model Context Protocol server     | `mcp-server`        | `<agent>/.squad/mcps/` (M2) |

M1 ships skill end-to-end. Role/MCP detection is wired in
`install_from_url` (so a single URL paste does the right thing regardless
of kind) but their `copy_to_agent` paths return BadRequest until the
respective milestones.

## Two-step UX

```
Tab del rol → "Browse library" → LibraryDialog
                                     ↓
                            ┌────────┴────────┐
                            ↓                 ↓
                  GitHub topic search   "Add by URL" input
                            ↓                 ↓
                            └────────┬────────┘
                                     ↓
                       1. Install to library    (writes to ~/.squad/library/)
                                     ↓
                       2. Add to this agent     (writes to <agent>/.agents/skills/)
```

The split is deliberate: one install, N agents. A skill the user values
gets reused across roles without re-fetching from GitHub each time.

## Files on disk

```
~/.squad/library/
  skill/
    <slug>/
      SKILL.md
      .source.json         { repo, source_url, installed_at, verified }
  role/                    (M4)
  mcp/                     (M2)
```

The library is global to the user — every workspace sees every install.
This trades isolation for simplicity; we picked simplicity because the
typical user reuses the same skills across workspaces.

## Detection rules

`install_from_url` clones nothing — it does up to three HEAD fetches against
`raw.githubusercontent.com` and inspects content. First match wins:

1. `SKILL.md` at root → `skill`
2. `squad.json` at root → `role`
3. `mcp.json` at root → `mcp`
4. None of the above → 400 BadRequest with the repo name in the message

Schemas required (M1 enforcement):

- **skill** — valid YAML frontmatter with at least `name`. Parsed by
  `squad_skills::format::parse_content`.
- **role** — JSON with `id` (string). `name`, `description`, `icon`
  optional; `CLAUDE.md` fetched if present.
- **mcp** — JSON with `name` and `command` (both strings). `args`, `env`,
  `description` optional.

Slug derivation: kebab-cased lowercase of `name`/`id`. Runs of
non-alphanumeric collapse to single `-`. See
`squad_engine_core::library::install::sanitize_slug`.

## Verified-publisher

`LibraryItem.verified` is reserved for a future verified-publisher program
(Vercel / Anthropic style). Every install today writes `verified: false`.
A future milestone (post-M5) will add either:

- a curated allowlist in a Squad-controlled catalog repo, or
- signed install manifests fetched alongside the package.

UI already renders a `Verified` badge when the flag is true, so flipping
this on later is a data-only change.

## Add by URL

Lowest-friction submission path: paste any GitHub URL, detect the kind,
install. No PR to a catalog repo, no Squad account, no submission queue.
The trade-off — anyone can publish to "the library" — is mitigated by:

1. UI warning copy ("Anyone can publish. Review the repo before installing.")
2. No code execution at install time (markdown / JSON only)
3. The user is the only audience for their own installs (until they choose
   to publish a `team.json` referencing them in M5)

## HTTP routes (engine)

```
POST /v1/library/install-from-url        body: { url }
GET  /v1/library/:kind                   list user's installed items of a kind
POST /v1/library/:kind/:slug/copy-to-agent  body: { agentPath }
```

Implementation:

- `engine/squad-engine-core/src/library.rs` — types, paths, public API
- `engine/squad-engine-core/src/library/install.rs` — install_from_url + bytes helpers + slug
- `engine/squad-engine-core/src/library/access.rs` — list/read/copy
- `engine/squad-engine-server/src/routes/library.rs` — HTTP handlers

## Frontend wiring

```
app/src/lib/github-topic-search.ts            GitHub search API client
app/src/lib/tauri.ts                          tauriLibrary wrapper
app/src/hooks/queries/use-library.ts          useUserLibrary, useInstallFromUrl, useCopyLibraryToAgent
app/src/hooks/queries/use-library-catalog.ts  useLibraryCatalog (GitHub topic)
app/src/components/library/library-dialog.tsx Main modal — kind-parameterized
app/src/components/library/library-card.tsx   One card per entry
app/src/components/library/add-by-url-dialog.tsx  URL paste flow
app/src/components/tabs/skills-tab.tsx        Opens LibraryDialog(kind="skill")
app/src/locales/{en,es,pt}/library.json       Namespace strings
```

The dialog is parameterized by `LibraryKind`. M2 reuses the same component
for MCPs by passing `kind="mcp"` from a new MCPs tab; M4 reuses it for
roles from the recruiter dialog. Three call sites, one UI primitive.

## Roadmap

| Milestone | Scope |
|-----------|-------|
| M1 ✓      | Skills end-to-end, MCPs/roles detection only |
| M2        | MCPs `copy_to_agent` writes to `.squad/mcps/mcps.json`, MCPs tab UI, JIT permission approval |
| M3        | Per-repo CLAUDE.md overrides (`<repo>/.squad/agents/<role>.md`) |
| M4        | Role library — move builtin roles to packaged files, fork & publish flow |
| M5        | `team.json` v2 referencing library installs (`claudeMdRef`, `skills[]`, `mcps[]`) |
| Post-M5   | Verified-publisher program flips `verified: true` on curated entries |

## When to extend

- **New kind** → add the variant to `LibraryKind` (Rust + TS), add a row to
  the `TOPIC_BY_KIND` map in `github-topic-search.ts`, add an
  `install_<kind>_bytes` helper in `library/install.rs`, add the read
  branch in `library/access.rs::read_item`, add `dialog.title.<kind>`
  copy in all three locales.
- **New trust mechanism** (e.g. signature verification) → add it to
  `install_from_url` before the file writes, and reflect status in the
  `verified` field on `.source.json` so the existing UI badge renders.
