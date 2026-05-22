# Team Library

Squad ships a roster of named role agents (Alex CTO, Maya Mobile, Diego Backend, Peter Frontend, Carlo Designer, Maria QA, Sam DevOps) so a workspace can be staffed in one click. Built across Milestones F + G + H — the team metaphor is the load-bearing UX.

## What lives where

```
app/src/agents/builtin/                   role agent configs (G.1)
  cto-agent.ts                            Alex — visión global
  mobile-lead-agent.ts                    Maya — RN/Expo
  backend-lead-agent.ts                   Diego — Node/Postgres
  frontend-lead-agent.ts                  Peter — React/Next
  designer-agent.ts                       Carlo — specs/flows
  qa-agent.ts                             Maria — test plans
  devops-agent.ts                         Sam — CI/CD
  index.ts                                catalog ordering (CTO first)

app/src/lib/recommend-team.ts             G.2 — stack → role inference
app/src/components/shell/recruit-team-dialog.tsx   G.3 — Hire dialog
app/src/lib/team-manifest.ts              H.1/H.2 — read/write team.json
ui/agent-schemas/src/team.schema.json     manifest schema (v1)
```

## The five mechanics

### 1. Per-agent project binding (F.1)
Each agent's `config.projectIds: string[]` decides which workspace projects are visible in the Repo tab. Empty array = **CTO mode** (sees all repos). Non-empty = specialist scope. Managed inline in the Repo tab toolbar (`🔗 Bindings`).

Schema: `ui/agent-schemas/src/config.schema.json` — `projectIds` is an additive optional field, so existing configs upgrade silently.

### 2. Workspace-level sprints/stories (F.2)
Stories used to live per-agent at `agent/.squad/stories/stories.json`. Now they live at `<workspace>/.squad/stories/stories.json` so every team member shares one Kanban. The `Workspace` engine type gained an optional `path` field (server-computed `docs.join(name)`) so the frontend can address workspace-level files via the existing `read_agent_file` / `write_agent_file` endpoints. No new engine routes were needed — those endpoints don't validate that the root is an agent.

### 3. Phase ownership + auto-handoff (F.3)
File: `<workspace>/.squad/phase-ownership/phase-ownership.json` — `Partial<Record<StoryPhase, agentId | null>>`. When a story's status → `done` in a non-`deliver` phase, it auto-advances to the next phase **and** reassigns to the agent that owns that next phase. If the next phase has no owner, the current assignee is preserved (work never falls on the floor). Hook: `usePhaseOwnership`. UI: `👥 Phase Owners` panel in the Sprints toolbar.

### 4. Agent state avatar (F.4)
`useAgentState(agentPath)` derives one of `working | needs_you | error | done | idle` from `useActivity` + `useSessionStatusStore`. `AgentStateAvatar` overlays a Discord-style dot in the bottom-right of the helmet — blue pulsing while running, amber when waiting on the user, red on error, emerald on done. Built so G.4 (sprite packs per role) can swap the helmet for a character without touching the state machine.

### 5. Team manifest (H.1 + H.2)
A repo-tracked `<repo>/.squad/team/team.json` carries the roster from machine to machine.

```json
{
  "version": 1,
  "agents": [
    { "role": "cto-agent", "name": "Alex" },
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
2. otherwise → `recommendTeam(projects)` heuristic
3. Always include CTO + QA as universal recommendations
4. No projects? → CTO + Designer (the early-product team)

Hire is **sequential** (`for...of` + `await`), not `Promise.all`. The engine's file watcher + workspace agent registry assume ordered writes; parallel creates race.

Each hired agent gets:
- `name` = manifest override OR role's built-in name (Maya, Diego, …)
- `color` = manifest override OR `AGENT_COLORS[i % palette.length]`
- `claudeMd` = role's built-in CLAUDE.md (the agent's voice + constraints)

## Stack detection (G.2)

`detectSignals(project)` reads `package.json` + a few config files in parallel:

| Signal | Role triggered |
|--------|----------------|
| `react-native` / `expo` dep | Maya |
| `next` / `astro` / `nuxt` dep | Peter |
| `@nestjs/core` / `fastify` / `express` / `@prisma/client` dep | Diego |
| `prisma/schema.prisma` file | Diego |
| `Dockerfile` exists | Sam |
| `.github/workflows/` exists | Sam |
| Always | CTO + Maria |

Deliberately deterministic — no LLM call so it runs instantly and offline. The user can override the selection before hiring.

## When to extend

- New role → add a file under `app/src/agents/builtin/`, register in `index.ts`, add its id to `ROLE_IDS` in `recommend-team.ts`, add a stack signal if it auto-recommends, add the Lucide icon to `agent-avatar.tsx`'s `iconMap`.
- New stack signal → extend `StackSignals` + `detectSignals()` + `rolesForSignals()` in `recommend-team.ts`.
- New phase → extend `StoryPhase` in `engine-client/src/types.ts` + `stories.schema.json` enum + `STORY_PHASES` / `PHASE_DOT_COLORS` in `sprints-tab.tsx` + `nextPhase()` ordering. Locales: `sprints.phases.<id>` in en/es/pt.

## Not yet built

- **G.4** — sprite packs per role (the shadcn-style character animations the user prototyped). Builds on F.4's state machine; the avatar component is ready to accept a `spritePack` prop.
- **H.3** — persistent "Detected team manifest in {repo}" banner outside the Recruit Team dialog (so users notice the import path on subsequent launches).
- **I.1** — per-repo CLAUDE.md overrides (`<repo>/.squad/agents/<role>.md` overlays the built-in CLAUDE.md for that role on that repo).
