# Team Library

Squad ships a roster of named role agents grouped into two tiers:

- **Protected default members** (auto-hired on every new workspace, can't be deleted): Sam CTO, Steve PM, Jane Code Reviewer, Jeff QA, Adam Architect.
- **Opt-in specialists** (hired via the recruiter from stack signals): Maya Mobile, Diego Backend, Peter Frontend, Carlo Designer, Marcus DevOps.

Built across Milestones F + G + H + M5 — the team metaphor is the load-bearing UX.

## What lives where

```
app/src/agents/builtin/                   role agent configs
  cto-agent.ts                            Sam — system-level lead (PROTECTED)
  pm-agent.ts                             Steve — stories + sprint planning (PROTECTED)
  code-reviewer-agent.ts                  Jane — diff/security review (PROTECTED)
  qa-agent.ts                             Jeff — test plans (PROTECTED)
  architect-agent.ts                      Adam — system design + ADRs (PROTECTED)
  mobile-lead-agent.ts                    Maya — RN/Expo
  backend-lead-agent.ts                   Diego — Node/Postgres
  frontend-lead-agent.ts                  Peter — React/Next
  designer-agent.ts                       Carlo — specs/flows
  devops-agent.ts                         Marcus — CI/CD
  index.ts                                catalog ordering + PROTECTED_CONFIG_IDS export

app/src/components/onboarding/
  create-protected-roster.ts              M5 — sequential auto-hire of the 5 protected
app/src/lib/recommend-team.ts             G.2 — stack → role inference (specialists only)
app/src/components/shell/recruit-team-dialog.tsx   G.3 — Hire dialog (specialists only)
app/src/lib/team-manifest.ts              H.1/H.2 — read/write team.json
ui/agent-schemas/src/team.schema.json     manifest schema (v1)
```

## Protected members (M5)

The five defaults are hired automatically by `hireProtectedRoster(workspaceId)` after every workspace create (both "Create new" and "Join from GitHub" paths in `workspace-dialog.tsx`). Each agent.json carries `"protected": true`; the engine returns 409 Conflict on DELETE with a "protected default member" message. The sidebar hides the Delete row-menu entry and ignores the Delete/Backspace keyboard shortcut for protected agents via the generic `disableDelete` flag on `SidebarItem` (no app-specific concept leaks into `@squad/layout`).

Hires are sequential — parallel creates race the workspace agent registry (same constraint as `RecruitTeamDialog`). Failures surface as a toast but never abort the workspace itself; the user keeps as many of the team as Squad could land.

Existing workspaces created before M5 are NOT auto-backfilled (the user may already have an agent named "Sam"; a forced rename or duplicate would surprise them). A future follow-up can add a "Recruit your default team" banner for legacy workspaces.

## The nine mechanics

### 1. Per-agent project binding (F.1)
Each agent's `config.projectIds: string[]` decides which workspace projects are visible in the Repo tab. Empty array = **CTO mode** (sees all repos). Non-empty = specialist scope. Managed inline in the Repo tab toolbar (`🔗 Bindings`).

Schema: `ui/agent-schemas/src/config.schema.json` — `projectIds` is an additive optional field, so existing configs upgrade silently.

### 2. Workspace-level sprints/stories (F.2)
Stories used to live per-agent at `agent/.squad/stories/stories.json`. Now they live at `<workspace>/.squad/stories/stories.json` so every team member shares one Kanban. The `Workspace` engine type gained an optional `path` field (server-computed `docs.join(name)`) so the frontend can address workspace-level files via the existing `read_agent_file` / `write_agent_file` endpoints. No new engine routes were needed — those endpoints don't validate that the root is an agent.

### 3. Phase ownership + auto-handoff (F.3)
File: `<workspace>/.squad/phase-ownership/phase-ownership.json` — `Partial<Record<StoryPhase, agentId | null>>`. When a story's status → `done` in a non-`deliver` phase, it auto-advances to the next phase **and** reassigns to the agent that owns that next phase. If the next phase has no owner, the current assignee is preserved (work never falls on the floor). Hook: `usePhaseOwnership`. UI: `👥 Phase Owners` panel in the Sprints toolbar.

### 4. Agent state avatar (F.4)
`useAgentState(agentPath)` derives one of `working | needs_you | error | done | idle` from `useActivity` + `useSessionStatusStore`. `AgentStateAvatar` overlays a Discord-style dot in the bottom-right of the helmet — blue pulsing while running, amber when waiting on the user, red on error, emerald on done. Built so G.4 (sprite packs per role) can swap the helmet for a character without touching the state machine.

### 6. Project Docs (I.1)
Project documentation that **all** agents in the workspace read, with optional per-role audience filtering. Two scopes:

- **Workspace-global** — `<workspace>/.squad/docs/*.md` — every agent in the workspace sees these (subject to `audience` frontmatter).
- **Per-agent private** — `<agent>/.squad/docs/*.md` — only that specific agent sees these.

Each doc supports optional YAML-ish frontmatter:

```markdown
---
title: "QA criteria"
audience: ["qa-agent", "cto-agent"]
---

## Coverage targets
- ...
```

`audience` omitted/empty = universal (every agent in scope). When set, only agents whose `config_id` matches one of the entries get the doc.

**Engine injection** lives in `engine/squad-engine-core/src/agents/prompt.rs::build_agent_context`. On session start it:
1. Reads `<agent>/.squad/agent.json` to know the agent's role
2. Reads `<workspace>/.squad/docs/index.json` + each listed doc, applies audience filter
3. Reads `<agent>/.squad/docs/index.json` + each listed doc (always included)
4. Appends each as a `# Project Doc — {title}` section

An `index.json` (`{ slugs: string[] }`) maintained by the frontend lets the engine enumerate docs without a directory listing endpoint. Deleting writes empty content + removes the slug from index — the engine treats empty bodies as "skip".

**UI** — new `Docs` tab on every role agent. Top has a scope toggle (`Workspace` / `<agent name>`). Per-doc autosave editor with title + audience chip selector + Markdown body. `+ New doc` opens a template picker (Architecture / Tech stack / Rules / Best practices / QA criteria / Code review criteria / blank).

Frontend parser: `app/src/lib/project-docs.ts::parseFrontmatter`. Engine parser: `agents/prompt.rs::parse_doc`. Both kept tiny + identical so a doc written from the UI loads correctly into the prompt.

### 7. Team manifest (H.1 + H.2)
A repo-tracked `<repo>/.squad/team/team.json` carries the roster from machine to machine.

```json
{
  "version": 1,
  "agents": [
    { "role": "cto-agent", "name": "Sam" },
    { "role": "mobile-lead-agent", "name": "Maya", "color": "green" },
    { "role": "backend-lead-agent", "name": "Diego" }
  ]
}
```

**Export** lives in the Repo tab toolbar (`📥 Export team`). It calls `buildManifestFromAgents` against the workspace's agents — non-role agents (blank, personal-assistant, community installs) are skipped because they're not portable. **Import** runs automatically when `RecruitTeamDialog` opens: if any bound project has a manifest, it overrides the heuristic recommendation; row badges flip from "Recommended" to "From team.json".

The manifest schema is registered in `engine/squad-agent-files/src/schemas.rs::ALL` so JSON Schema validators see it.

## Hire flow (G.3)

`RecruitTeamDialog` reads:
1. `projects` → if any has a team.json, use those roles + name/color overrides
2. otherwise → `recommendTeam(projects)` heuristic (specialists only — the 5 protected defaults are already in the workspace)
3. No projects? → Designer (the early-product specialist)

Hire is **sequential** (`for...of` + `await`), not `Promise.all`. The engine's file watcher + workspace agent registry assume ordered writes; parallel creates race.

Each hired agent gets:
- `name` = manifest override OR role's built-in name (Maya, Diego, …)
- `color` = manifest override OR `AGENT_COLORS[i % palette.length]`
- `claudeMd` = role's built-in CLAUDE.md (the agent's voice + constraints)

## Stack detection (G.2)

`detectSignals(project)` reads `package.json` + a few config files in parallel:

| Signal | Specialist recommended |
|--------|------------------------|
| `react-native` / `expo` dep | Maya |
| `next` / `astro` / `nuxt` dep | Peter |
| `@nestjs/core` / `fastify` / `express` / `@prisma/client` dep | Diego |
| `prisma/schema.prisma` file | Diego |
| `Dockerfile` exists | Marcus |
| `.github/workflows/` exists | Marcus |

The five protected defaults (Sam, Steve, Jane, Jeff, Adam) are NOT in this table — they're auto-hired by `hireProtectedRoster` regardless of stack.

Deliberately deterministic — no LLM call so it runs instantly and offline. The user can override the selection before hiring.

## When to extend

- New role → add a file under `app/src/agents/builtin/`, register in `index.ts`, add its id to `ROLE_IDS` in `recommend-team.ts`, add a stack signal if it auto-recommends, add the Lucide icon to `agent-avatar.tsx`'s `iconMap`.
- New stack signal → extend `StackSignals` + `detectSignals()` + `rolesForSignals()` in `recommend-team.ts`.
- New phase → extend `StoryPhase` in `engine-client/src/types.ts` + `stories.schema.json` enum + `STORY_PHASES` / `PHASE_DOT_COLORS` in `sprints-tab.tsx` + `nextPhase()` ordering. Locales: `sprints.phases.<id>` in en/es/pt.

### 8. Workspace settings page (I.2)
Sidebar entry **Workspace** (between Store and Integrations) opens a page with three sections:

- **Docs** — read-only viewer of `<workspace>/.squad/docs/*` with template-picker "+ New doc". Edits + audience tagging still happen in the per-agent Docs tab (same files, same hook).
- **Phase Owners** — same per-phase agent picker as the Sprints toolbar, accessible without entering an agent.
- **Projects** — list, add, delete workspace projects. Per-row **Export team** writes `<repo>/.squad/team/team.json` from the current roster.

`viewMode === "workspace"` joins the existing `isTopLevel` set in `sidebar.tsx` so it's treated like Mission Control / Store / Settings rather than an agent tab.

### 9. Team manifest banner (H.3)
When a bound project ships a `team.json` whose roles aren't all present in the workspace, `TeamManifestBanner` renders above every workspace view with a one-click **Hire team** CTA. Click opens `RecruitTeamDialog` which preselects the missing members. Per-session dismiss via `sessionStorage`. Hook: `useDetectedTeamManifest()`. The banner self-hides as soon as the user hires all missing members.

## Avatar sprite slot (G.4, infrastructure only)

`AgentStateAvatar` accepts a `spritePack?: Partial<Record<AgentState, string>>` prop. When a state has a URL in the pack, the helmet is replaced by an `<img>` for that state; missing states fall back to the helmet. Real animated sprite packs (Idle / Walk / Wave / Failed art) are not bundled — they need real design assets. The seam exists so adding them later is a one-line change at the call site.

## Not yet built

- **Animated sprite packs** with multi-frame sheets (the shadcn-style preview the user shared). Needs commissioned art per role.
- **Per-repo CLAUDE.md overrides** — `<repo>/.squad/agents/<role>.md` overlays a role's built-in CLAUDE.md for that repo specifically. The repo-tracked Docs (I.1) cover most of this need, but a per-role overlay would let a project tell Maya "for this repo, use functional components only" without touching the universal docs.
