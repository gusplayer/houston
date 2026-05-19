# Squad Engine Server — Operator Guide

`squad-engine` is the binary that speaks `knowledge-base/engine-protocol.md`.
Everything Squad can do on a laptop it can do on a VPS — the desktop app
spawns this binary as a subprocess and talks to it the same way a remote
client would.

## Binary

- Crate: `engine/squad-engine-server`
- Bin target: `squad-engine`
- Build: `cargo build --release -p squad-engine-server --bin squad-engine`

## Runtime config

All via environment variables.

| Var | Default | Purpose |
|---|---|---|
| `SQUAD_BIND` | `127.0.0.1:0` | `ip:port`. Random local port by default. |
| `SQUAD_BIND_ALL` | unset | Must be `1` to bind `0.0.0.0`. Safety net against accidental public exposure. |
| `SQUAD_ENGINE_TOKEN` | auto | Bearer token clients must send. 48-char alphanumeric if unset. |
| `SQUAD_HOME` | `~/.squad` | DB, logs, `engine.json`, workspaces. |
| `SQUAD_DOCS` | `$SQUAD_HOME/workspaces` | Workspaces filesystem root. |
| `SQUAD_APP_SYSTEM_PROMPT` | `""` | Product-layer system prompt. Prepended to every session when the caller doesn't supply its own. Set by the embedding app (e.g. Squad desktop) at subprocess spawn. Engine treats it as an opaque string — no hardcoded product copy in engine source. |
| `SQUAD_APP_ONBOARDING_PROMPT` | `""` | Product-layer onboarding suffix. Appended after the system prompt on first-run sessions (`POST /v1/agents/:path/sessions/onboarding`). |
| `SQUAD_NO_PARENT_WATCHDOG` | unset | Set to `1` to disable the stdin-EOF → exit watchdog (see "Parent watchdog" below). Required when running under systemd/docker where no supervisor holds the stdin pipe. |
| `RUST_LOG` | `info,squad=debug` | `tracing` filter. |

## Startup handshake

On bind the binary:

1. Writes `$SQUAD_HOME/engine.json` (chmod 0600) with:
   ```json
   {
     "version": "0.4.0",
     "protocol": 1,
     "port": 53871,
     "pid": 84721,
     "token_hash": "<sha256 of token>"
   }
   ```
2. Emits one line to **stdout**:
   ```
   SQUAD_ENGINE_LISTENING port=53871 token=<full-token>
   ```

The desktop supervisor (`app/src-tauri/src/engine_supervisor.rs`) parses
that line to bootstrap the webview. Do **not** log the token anywhere
else.

**stdout vs stderr:** the banner is the ONLY stdout write. All
`tracing` output goes to stderr. That lets the supervisor close its
read-end of stdout after the banner without triggering EPIPE storms on
the engine side.

## Process model

- Single process, tokio multi-threaded runtime.
- `axum` 0.7 with `ws` feature.
- `BroadcastEventSink` fanout capacity: 1024.
- WS heartbeat: 20s ping, 45s dead-conn timeout (configurable, Phase 2).
- Graceful shutdown: `SIGTERM`/`SIGINT` → drain in-flight requests → exit.

## Supervision (desktop)

`engine_supervisor.rs` spawns the binary with:

- **Piped stdin** that the supervisor holds open but never writes.
  When the supervisor (the Tauri app) exits for any reason, the pipe
  closes → the engine's `spawn_parent_watchdog` sees stdin EOF →
  `exit(0)`. This is the cross-platform orphan-prevention.
- **macOS/Linux:** `setpgid(0,0)` so the child gets its own process group.
  Parent drop also kills `-pgrp` as a backup path.
- **Linux:** `prctl(PR_SET_PDEATHSIG, SIGKILL)` (Phase 4 task; the
  stdin watchdog already covers this case).
- **Windows:** Job Objects with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`
  (Phase 4 task).

Restart policy: exponential backoff 500ms → 30s cap on child crash.

### Parent watchdog

`engine/squad-engine-server/src/main.rs::spawn_parent_watchdog` runs a
blocking read on stdin. On EOF (parent pipe closed), the process exits.
Gating:

- Disabled when stdin is a TTY (i.e. you're running the binary by hand
  for debugging). `IsTerminal::is_terminal()` check.
- Disabled when `SQUAD_NO_PARENT_WATCHDOG=1` is set. Use this under
  systemd, docker, or any supervisor that owns lifecycle some other
  way.

**Important interaction:** `engine_supervisor.rs` takes the child's
`ChildStdin` out of `Child` before any `wait()` call — `Child::wait()`
closes stdin as part of its contract, which would otherwise trip the
watchdog the moment the supervisor tried to reap.

## Deployment modes

| Mode | Bind | Auth source | Supervisor |
|---|---|---|---|
| Local (desktop) | `127.0.0.1:0` | stdout banner | Tauri `setup()` |
| Always On (VPS) | `0.0.0.0:7777` behind TLS proxy | `.env` file | systemd / docker |
| Teams (multi-tenant) | fronted by proxy | per-tenant secret | k8s / nomad (future) |

See `always-on/README.md` for the VPS path.

## Health monitoring

- `GET /v1/health` → 200 with JSON body.
- `GET /v1/version` → build + semver.
- `tracing` spans every request with method, path, status, duration.
- Prometheus exporter: planned for Phase 6.

## Rolling upgrades

1. Pull new binary.
2. `systemctl restart squad-engine` (or `docker compose up -d`).
3. Clients with open WS reconnect automatically (exponential backoff in
   `@squad/engine-client`).
4. Major protocol bump → clients get 426 Upgrade Required (Phase 2 task).

## Troubleshooting

- **Bind refused** → another instance or port in use. Check `engine.json`.
- **401 everywhere** → stale token. Delete `engine.json` and restart.
- **WS disconnects every 20s** → proxy killing idle conns; extend
  upstream timeout past 30s.
- **Desktop never launches** → supervisor did not see banner in 5s. Check
  child stderr; binary missing from sidecar bundle?
- **Engine exits immediately on manual run / under non-Tauri supervisor** →
  parent watchdog sees no writer on stdin. Set `SQUAD_NO_PARENT_WATCHDOG=1`
  or redirect stdin from a pipe that stays open (`cat | squad-engine`).
- **CORS `Load failed` in WKWebView** → rebuild the engine. The old
  allow_methods list omitted PUT/PATCH; current code uses `Any` + `*`
  wildcard. Stale sidecar binary is the usual cause.
