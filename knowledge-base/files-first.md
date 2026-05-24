# Files-First (`.squad/`)

Squad uses files, not DB, for agent-visible data. SQLite only for chat replay + app prefs.

## Rule
If @squad component renders it → `.squad/` folder.
If app-specific → `.squad/`.

## Layout

```
~/.squad/workspaces/{Workspace}/
  .squad/
    projects.json                workspace-scoped repo bindings (squad-projects)
    sprints/sprints.json         workspace-scoped Sprints (F.2)
    stories/stories.json         workspace-scoped Stories (F.2)
    phase-ownership/
      phase-ownership.json       phase → owning agent id (F.3)
    docs/                        project docs visible to every agent (I.1)
      index.json                 { slugs: string[] }
      architecture.md            universal — audience omitted
      qa-criteria.md             audience: [qa-agent] in frontmatter
      review-criteria.md         audience: [cto-agent, *-lead-agent]
  {Agent}/
  .squad/
    agent.json                  AgentMeta (id, manifest_id, created_at, last_opened_at)
    activity/
      activity.json             Activity[]
      activity.schema.json      JSON Schema
    routines/
      routines.json + .schema.json
    routine_runs/
      routine_runs.json + .schema.json
    config/
      config.json + .schema.json
      # config.projectIds: string[]  per-agent project binding (F.1).
      # Empty/unset = CTO mode (sees every workspace project).
    mcps/
      mcps.json + .schema.json   per-agent MCP server config (B.1)
    docs/                         agent-private project docs (I.1)
      index.json                  { slugs: string[] }
      <slug>.md                   markdown with optional frontmatter
    learnings/
      learnings.json + .schema.json   ({id, text, created_at})
      # Legacy `.squad/memory/learnings.md` auto-migrated on startup
      # (bullet list → JSON). See `squad_agent_files::migrate_agent_data`.
    prompts/
      modes/<mode>.md           editable per-mode prompt overlay (user-owned)
    sessions/
      anthropic/{session_key}.sid       current Claude resume id
      anthropic/{session_key}.history   all Claude resume ids used by this conversation
      anthropic/{session_key}.invalid   Claude resume ids rejected by the CLI
      openai/{session_key}.sid          current Codex resume id
      openai/{session_key}.history      all Codex resume ids used by this conversation
      openai/{session_key}.invalid      Codex resume ids rejected by the CLI
      {session_key}.sid                 legacy flat resume id, read as fallback only
  .agents/
    skills/<name>/SKILL.md      Claude Code skill convention
  .claude/
    skills/<name>               symlink → ../../.agents/skills/<name>
  CLAUDE.md                     agent instructions
  AGENTS.md                     symlink → CLAUDE.md (for Codex)
```

## File I/O path
Frontend never touches the filesystem directly. All `.squad/` reads
and writes flow through `@squad/engine-client` → `squad-engine`
REST routes (`/v1/agents/:path/files/:kind`, etc.), which call into
`squad-agent-files`. Writes are atomic (temp + rename) and emit a
matching `SquadEvent` over the WS. No typed CRUD — per-type folder +
schema + a generic read/write pair covers everything.

## Schemas
Authoritative. Live in `ui/agent-schemas/src/*.schema.json`. Embedded in Rust via `include_str!` in `squad-agent-files::schemas`. Seeded into each agent's `.squad/<type>/<type>.schema.json` on first launch. Prompts instruct model to read schema before writing data file.

## Learnings prompt injection
`engine/squad-engine-core/src/agents/prompt.rs::build_agent_context`
injects `.squad/learnings/learnings.json` into each session as a
bounded, frozen-at-session-start background block. Only each entry's
`text` field is rendered; `id`, `created_at`, and any future metadata
stay storage/UI-only. Writes during a session persist immediately but are
not visible in the already-started prompt until the next session.

## Migration
`squad_agent_files::migrate_agent_data()` runs on every `seed_agent()`. Idempotent. Leaves legacy flat-layout data files in place as rollback. Legacy product-prompt seeds (`.squad/prompts/system.md`, `.squad/prompts/self-improvement.md`) are deleted — the Squad product prompt now lives in the app binary (`app/src-tauri/src/squad_prompt/`), not on disk.

Session resume IDs are provider-scoped for new writes so Claude and Codex
never overwrite each other's current resume ID. Existing
`.squad/sessions/{session_key}.sid` files stay in place and are read as
a fallback until a provider writes its own scoped `.sid`. Chat history
loads the legacy ID plus every provider current/history ID for the same
session key. Provider-scoped `.invalid` files stop a rejected legacy ID
from being retried by the provider that rejected it.

## Atomic writes
All writes: temp file + rename. Path-traversal safe via `squad-agent-files::safe_relative`.

## Repo-tracked files (outside `~/.squad/`)
A few schemas live **in the user's repo**, versioned alongside the code so cloning the repo is enough to share configuration:

```
<repo>/.squad/
  team/team.json                portable team manifest (H.1 / H.2)
```

The team manifest lists role agents (Maya, Diego, Peter…) the repo expects. `RecruitTeamDialog` reads it on open and pre-selects those roles; `Export team` in the Repo tab writes it. The engine's `read_agent_file` / `write_agent_file` endpoints don't validate that the root is an agent, so the same plumbing addresses both `~/.squad/**` and repo trees. See `knowledge-base/team-library.md` for the full team metaphor.

## Activity statuses
`queue` · `running` · `needs_you` · `done` · `cancelled`

## Skills discovery
Skills live at `.agents/skills/<name>/SKILL.md`. Squad mirrors to `.claude/skills/<name>` via symlink (Claude Code reads). Flat `.md` under `.agents/skills/` auto-migrated to `<name>/SKILL.md` on next `list_skills`.

Same files surface in the UI as **Skills**. Frontmatter drives card image, category tabs, featured-state showcase, and integration logos. Selecting a Skill pins it above the regular composer; free-form text remains in chat. Full schema + render pipeline → [`skills.md`](skills.md).

## SQLite (minimal)
Live tables:
- `chat_feed` - keyed by provider CLI session id (`claude_session_id` column name is legacy). UI conversation replay on restart.
- `preferences` — app-level (last_workspace_id etc). Not scoped.
- `session_usage` — per-`(session_key, provider)` token + cost accumulation. Denormalised `agent_path` + `workspace_id` columns so the dashboard rolls up without join lookups. Cumulative counters sum across every turn; `last_window_tokens` overwrites with the most recent turn's combined input so the "context window used" bar reflects current state, not lifetime sum. Upserts emit `SessionUsageChanged`. See `engine-protocol.md` for the matching REST routes.
- `engine_tokens` — device-scoped bearer tokens (phone pairing). NOT AI provider tokens; the name predates the usage table.
- `phone_access` — stable QR secret for phone pairing.

Everything else lives in files.

User-message rows may include leading `<!--squad:skill ...-->` or
`<!--squad:attachments ...-->` markers (the legacy `<!--houston:action ...-->`
and `<!--houston:skill ...-->` prefixes are still decoded for chat history
written before the rename). These are display metadata only;
the same row still contains the Claude-facing prompt body after the marker.
Renderers decode the marker so users see cards/badges in chat instead
of raw prompt prefaces.

## Session file-change attribution
Chat sessions snapshot user-visible project files before and after the
CLI run. The engine diffs those snapshots and persists a `file_changes`
feed item with `created` and `modified` absolute paths. The visible-file
filter is shared with the project file browser, so helper files such as
Python scripts, JSON, Markdown, `.squad/`, `.agents/`, and dotdirs stay
out of chat summaries by default; dev tooling that wants the raw diff
can read the underlying snapshots directly.

Attribution is strict only when one session owns a working directory. The
engine enforces that by holding a per-`working_dir` guard for chat and
routine sessions. Different worktrees/folders can run in parallel. A
second session in the same folder gets a conflict instead of producing a
false file summary.

## AI-native reactivity (MANDATORY)

Users + LLMs equal participants. Both read/write all workspace data. All changes visible to both immediately.

### Two writers
1. **Frontend via the engine** — user clicks "Create Activity" → React hook → `engine-client` → `squad-engine` REST route → `squad-agent-files` writes the file.
2. **CLI agent direct writes** — the claude/codex subprocess writes `.agents/skills/<name>/SKILL.md` or updates `.squad/<type>/<type>.json` directly without talking to the engine.

### Three-layer reactivity stack
1. **TanStack Query (frontend)** — all `.squad/` fetches via `useQuery`. Query keys: `["activity", agentPath]` etc. Dedup, background refresh, stale-while-revalidate.
2. **Event emission on engine writes** — the engine's write helpers emit `SquadEvent` variants (`SkillsChanged`, `ActivityChanged`, `LearningsChanged`, …) onto its broadcast bus. The desktop WS client (`ui/engine-client`) fans them out; global listeners in `app/src/hooks/use-agent-invalidation.ts` invalidate the matching query key.
3. **File watcher on `.squad/` (Rust `notify`, `squad-file-watcher`)** — catches direct agent writes that bypass the engine's write path. Emits the same events onto the same bus. Debounced.

### The rule
Never build feature where agent changes data but UI won't reflect until refresh. If in `.squad/`, must be reactive.

## User data = upgrade-safe
Files under `~/.squad/**` exist on user machines. Changing shape/layout requires **idempotent migration** on upgrade. See `squad_agent_files::migrate_agent_data`. Never leave existing users broken. Legacy `~/Documents/Houston/**` paths from the upstream Houston app are not auto-migrated by Squad.
