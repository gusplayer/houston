# Architecture

Squad = open platform. Organized as **6 products + 3 code libraries**.

## The 6 products (end-user)

| Product | Dir | What |
|---------|-----|------|
| Squad App | `app/` | Desktop app (Tauri 2). Developers and dev teams create agents, run parallel terminal sessions. |
| Squad Mobile | `mobile/` | React PWA served from `tunnel.getsquad.ai`. No native app — pure web, same origin as the relay. |
| Squad Store | `store/` | Release-bundled registry of pre-built Squad agents. One-click install. |
| Squad Website | `website/` | getsquad.ai landing. |
| Squad Always On | `always-on/` | One-click deploy Engine to VPS/microVM. Agents 24/7. **TBD.** |
| Squad Teams | `teams/` | Hosted multi-tenant agent pool w/ perms. **TBD.** |

## The 3 code libraries

| Library | Dir | What | Consumers |
|---------|-----|------|-----------|
| Squad UI | `ui/` | `@squad/*` React components | App, Mobile, future hosted products' frontends |
| Squad Engine | `engine/` | Rust crates. **Frontend-agnostic backend.** Open source. Anyone self-hosts or uses as desktop-app backend. | App (via `app/squad-tauri` adapter), Always On, Teams, Cloud customers |
| Squad Cloud | `cloud/` | Managed Engine deployments. **TBD.** | Third-party devs building on Engine |

## Key distinction: Engine is standalone

**Squad Engine is the reusable backend.** Devs run it themselves (open source) or rent it via Cloud. Devs put ANY frontend on top — Squad App is just ONE consumer.

- Engine stays pure Rust, no Tauri, no React, no webview assumption
- `app/squad-tauri/` is the **adapter** that applies Engine to the Tauri desktop frontend. Lives under `app/`, not `engine/`.
- Future Always On + Teams consume Engine over network (HTTP/WS — **not yet built**)

## Infra dirs (not products)

| Dir | What |
|-----|------|
| `squad-relay/` | Cloudflare Worker + Durable Object at `tunnel.getsquad.ai`. Reverse-tunnel proxy (desktop engine dials outbound; mobile traffic multiplexes over that link) AND static host for the mobile PWA. One origin for both so Safari sees first-party traffic. Deploys separately. |
| `examples/` | Reference consumers of `squad-engine` for third-party devs. First entry: `examples/smartbooks/` — a custom React frontend, own brand, zero `@squad/*` UI deps. Lives in the monorepo (not a separate repo) so it stays in sync with protocol changes. |
| `knowledge-base/` | These caveman docs. Loaded on demand. |
| `scripts/` | Version bump, release, CLI binary fetch. |

## Engine crates (`engine/`)

15 crates. All pure libraries. No frontend assumptions. Full list in
the workspace root `Cargo.toml`.

- `squad-db` — libSQL. `chat_feed`, `preferences`, `engine_tokens` (device auth), `phone_access`, `session_usage` (per-session token + cost rollups) tables.
- `squad-terminal-manager` — Claude/Codex subprocess manager, parser, streaming
- `squad-events` — hook/webhook/lifecycle queue
- `squad-scheduler` — cron + heartbeat
- `squad-agent-files` — `.squad/` file I/O, schemas, migration
- `squad-agents-conversations` — chat feed persistence
- `squad-ui-events` — typed event bus + `EventSink` trait (Tauri/broadcast impls, frontend-neutral)
- `squad-file-watcher` — `notify` on `.squad/`, emits events
- `squad-composio` — Composio CLI lifecycle (bundle-aware: skips install when shipped inside the .app)
- `squad-cli-bundle` — resolve bundled CLI binaries (codex universal, composio per-arch) inside the `.app`/MSI; reads pinned `cli-deps.json` manifest
- `squad-claude-installer` — runtime download of Claude Code CLI (proprietary license, can't bundle); pinned URL + sha256 verification, atomic install, progress events
- `squad-tunnel` — outbound reverse tunnel client; desktop engine dials the relay so mobile can reach it through NAT. Heartbeat + watchdog; tunnel identity stays stable across normal network failures and only re-allocates on relay auth rejection.
- `squad-skills` — skill discovery + management
- `squad-methodology` — parallel-dev methodology templates + project seeding (`seed_project_methodology` writes `.claude/{agents,hooks,commands,rules,method.config}` + `claude-method.md` into a project repo). Pure file I/O; consumed by `squad-engine-core::methodology`.
- `squad-engine-core` — runtime container (`EngineState`, paths, `workspaces::*`, `agents::{activity,routines,routine_runs,config,conversations,files,prompt,self_improvement}`, `sessions::{history,provider,summarize,transcript_ingest}`, `routines::{runner,runs,scheduler,engine_dispatcher}`, `store`, `sync`, `worktree`, `provider`, `attachments`, `preferences`, `conversations`, `skills`, `agent_configs`, `methodology`). Domain logic relocated from the Tauri adapter.
- `squad-engine-protocol` — wire types (REST DTOs, WS envelope, error codes, `PROTOCOL_VERSION`). Matches `ui/engine-client/src/types.ts`.
- `squad-engine-server` — axum HTTP+WS binary `squad-engine`. The process every client talks to. Full REST surface live — 19 route modules covering workspaces, agents CRUD, sessions, agent data + files, routines + scheduler, skills, store, composio, claude (runtime install), tunnel + pairing, worktrees, shell, attachments, preferences, providers, agent-configs, conversations, watcher, usage, methodology. See `knowledge-base/engine-protocol.md` for the complete table.

**Bundled provider CLIs:** Squad ships the codex CLI (Apache-2.0) and
composio CLI (MIT) inside the signed/notarized `.app` so users get
them preinstalled out of the box. The proprietary Claude Code CLI is
downloaded on first launch with sha256 verification. Resolution + install
flow detailed in `knowledge-base/cli-bundling.md`.

**Standalone engine, shipped:** the desktop app spawns `squad-engine`
as a subprocess on startup (sidecar via Tauri `externalBin`), parses
the stdout `SQUAD_ENGINE_LISTENING` banner for `{port, token}`, and
talks to it over HTTP+WS — the same way a remote client on a VPS
would. The supervisor (`app/src-tauri/src/engine_supervisor.rs`) pipes
stdin so engine sees EOF on parent death and exits cleanly (no orphan
engines holding ports). All domain Tauri commands are deleted — only
OS-native glue remains in `app/src-tauri/src/commands/`.

**Telemetry architecture (xterm-first):** xterm is the primary human surface.
Agents' conversations happen in the interactive PTY (no `-p` stream-json).
Usage and feed data come from Claude Code's own JSONL transcripts at
`~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` via
`sessions::transcript_ingest::TranscriptIngest` — a single background
task that polls every 3 s per registered agent:

- `assistant` lines with `message.usage` → `upsert_session_usage` → dashboard
- `user` / `assistant` content blocks → `chat_feed` rows + `FeedItem` WS events
  → desktop history + mobile feed (only for sessions not already owned by the
  headless runner; runner still writes feed for routines and mobile-send turns)
- `.sid` updated on first ingest-owned session so `history::load` resolves it

Routine/headless sessions use `session_key = "routine-{id}-run-{id}"` (never
collides with interactive `"chat-{agentId}"`). Each has its own Claude session.

## App-side Rust (`app/`)

- `app/squad-tauri/` — Tauri adapter. Binds engine crates (db, event
  queue, schedulers, watcher) to Tauri state and emits Tauri events.
  The engine supervisor uses the same crates but speaks HTTP/WS
  externally. **Not part of Engine.**
- `app/src-tauri/` — Tauri binary. Depends on `squad-tauri` + engine
  crates. Spawns the engine subprocess in `setup()`, waits for
  `/v1/health`, injects `window.__SQUAD_ENGINE__` handshake before
  the React tree mounts (see `EngineGate` in `app/src/main.tsx`).

## UI packages (`ui/`)

11 packages under `@squad/`: `core, chat, board, layout, events,
routines, skills, review, agent, agent-schemas, engine-client`.

Mostly internal. `@squad/engine-client` is the one package we
expect third-party devs to install — it's the TypeScript front door to
the engine HTTP+WS protocol. `@squad/agent-schemas` ships the
JSON schemas that Rust embeds via `include_str!` — source of truth for
the typed `.squad/<type>/<type>.json` layout.

## Current gap to vision

| Goal | Status |
|------|--------|
| Clear product dirs | ✅ done |
| App ↔ Engine clear boundary | ✅ `app/squad-tauri` split |
| UI standalone | ✅ |
| Engine reusable by non-Tauri frontends | ✅ binary ships as Tauri sidecar + standalone; desktop app consumes it over HTTP/WS, no in-process coupling |
| Reference custom-frontend integration | ✅ `examples/smartbooks/` — Vite + React, own brand, ~400 LOC TSX, proven end-to-end |
| Always On | ✅ Dockerfile + compose + systemd unit + README all shipped |
| Teams / Cloud | 🟡 Identity foundation shipped (Supabase Google SSO + Keychain sessions — see `knowledge-base/auth.md`); Cloud API surface TBD |
| Store populated | 🟡 release-bundled MVP: `store/catalog.json` + `store/agents/*`; in-app + website Store surfaces with mock community agents; remote catalog server + real submissions TBD (see `store-marketplace.md`) |
| Binary file read route (xlsx, pdf download through HTTP) | ❌ workaround: use `/v1/shell` with `open`/`xdg-open` to hand binary files to host OS |
| Windows support (Rust engine layer) | ✅ `cargo check --target x86_64-pc-windows-gnu` clean across the workspace; platform-specific branches (taskkill vs kill, PATH separator, symlink_dir) covered. See `knowledge-base/platform-matrix.md`. |

## Direction of work
- **library-first** — new reusable capability → ui/ or engine/, then consumed by app/
- **app-first** — feature needed in app/, extract to library when reuse appears
- **single-layer** — only one area touched

Not sure? Start in app/. Extract later.
