<p align="center">
  <a href="https://getsquad.ai">
    <strong>Squad</strong>
  </a>
</p>

<p align="center">
  <strong>The open source platform for AI-native dev workflows.</strong><br>
  One desktop app. Pre-built AI agents that work from day one.<br>
  Real tools. 1000+ integrations. Free forever.
</p>

<p align="center">
  <a href="https://getsquad.ai">getsquad.ai</a> ·
  <a href="https://getsquad.ai/vision/">Vision</a> ·
  <a href="https://getsquad.ai/learn/">Learn</a> ·
  <a href="https://getsquad.ai/startups/">For Teams</a> ·
  <a href="https://forms.gle/ac24qrKSufYvfudt8">Join the waiting list</a>
</p>

<p align="center">
  <a href="https://github.com/getsquad/squad/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-0d0d0d" alt="MIT License"></a>
  <a href="https://github.com/getsquad/squad/stargazers"><img src="https://img.shields.io/github/stars/getsquad/squad?color=0d0d0d" alt="Stars"></a>
</p>

---

## What Squad is

**For developers** — a free desktop app with AI agents that do real work. Code review, refactoring, research, automation. Install agents from the store and start working. Built for engineers who want AI as a teammate, not a toy.

**For dev teams** — the platform where you build AI-native workflows for your team. Define your agents, Squad handles the workspace, the chat, the board, the integrations. You bring the domain expertise. [Read more](https://getsquad.ai/startups/).

> **Read the vision:** [Ship the impossible](https://getsquad.ai/vision/)

---

## Quick start

### Run the Squad app

```bash
git clone https://github.com/getsquad/squad.git
cd squad
pnpm install
cd app && pnpm tauri dev
```

### Build your first agent

Create two files:

**squad.json**
```json
{
  "id": "bookkeeper",
  "name": "Bookkeeper",
  "description": "Categorize expenses and reconcile accounts.",
  "icon": "Calculator",
  "category": "business",
  "tabs": [
    { "id": "board", "label": "Tasks", "builtIn": "board", "badge": "activity" },
    { "id": "files", "label": "Files", "builtIn": "files" },
    { "id": "job-description", "label": "Instructions", "builtIn": "job-description" }
  ]
}
```

**CLAUDE.md**
```markdown
# Bookkeeper

You categorize transactions, reconcile accounts, and flag anomalies.
Ask which period the user wants before starting.
```

Push to GitHub. In Squad, click **New Agent > GitHub**, paste your repo URL. Done.

The [Learn guide](https://getsquad.ai/learn/) covers the full details in five short chapters.

### Share a workspace template

Bundle multiple agents into one repo:

```
my-workspace/
├── workspace.json
└── agents/
    ├── bookkeeper/
    │   ├── squad.json
    │   └── CLAUDE.md
    └── tax-reviewer/
        ├── squad.json
        └── CLAUDE.md
```

**workspace.json**
```json
{
  "name": "Tax Practice",
  "description": "A complete workspace for tax professionals.",
  "agents": ["bookkeeper", "tax-reviewer"]
}
```

In Squad, click **New Workspace > Import from GitHub**, paste the repo URL. Squad creates the workspace with all agents ready to use.

---

## How the app works

Squad organizes work into **Workspaces** and **Agents**:

- **Workspace** — a group of agents (like a team or project).
- **Agent** — an AI agent instance. Chat, kanban board, skills, files, integrations.
- **Agent Definition** — a `squad.json` that defines what an agent looks like and does.

```
Workspace ("Tax Practice")
  ├── Agent ("Bookkeeper")         ← board, files, instructions
  ├── Agent ("Document Reviewer")  ← board, files, integrations
  └── Agent ("Client Comms")       ← board, files, integrations
```

Each kanban card is a Claude conversation. Click a card to see the full chat. Connect Slack and the same conversation becomes a thread.

---

## Agent definitions

Three tiers:

| Tier | What you write | What you get |
|------|---------------|-------------|
| **JSON-only** | `squad.json` + `CLAUDE.md` | Tabs, prompt, icon. Uses built-in components. |
| **Custom React** | Add `bundle.js` | Custom React components as tabs. |
| **Workspace template** | `workspace.json` + agents folder | Multiple agents, one import. |

**Built-in tab types:** `board`, `files`, `job-description`, `integrations`, `routines`, `configure`, `events`

---

## Monorepo layout

Organized as **6 end-user products + 3 code libraries**.

```
squad/
├── app/                     Squad App — desktop (Tauri 2)
│   ├── src/                 React frontend
│   ├── src-tauri/           Tauri binary
│   └── squad-tauri/         Tauri adapter (applies Engine to desktop)
├── mobile/                  Squad Mobile companion
├── desktop-mobile-bridge/   Cloudflare Worker — pairs Desktop ↔ Mobile
├── store/                   Squad Store — agent registry
├── website/                 Squad Website — getsquad.ai
├── always-on/               Squad Always On — VPS deploy (Dockerfile + compose + systemd)
├── teams/                   Squad Teams (TBD — hosted multi-tenant)
│
├── ui/                      Squad UI — @squad/* React packages
├── engine/                  Squad Engine — Rust crates (frontend-agnostic)
├── cloud/                   Squad Cloud (TBD — managed Engine hosting)
│
└── examples/                Reference consumers of squad-engine
    └── smartbooks/            Bookkeeping app built on a custom React frontend
```

See `knowledge-base/architecture.md` for crate-level detail + current gaps.

---

## Build on Squad Engine (custom frontends)

The engine is frontend-agnostic. You don't have to ship inside the
Squad App — any web or native runtime can drive it over HTTP +
WebSocket using [`@squad/engine-client`](ui/engine-client/).

**Working example: [SmartBooks](examples/smartbooks/)** — a
bookkeeping product with its own brand, its own UX, and zero
`@squad/*` UI deps. ~400 lines of TSX, one npm package, renders
a live transactions table + a multi-sheet Excel workpaper. Soft
workflow: the user asks for a new column, Claude edits the Python
script, every future upload picks up the change. Clone it, rename
things, ship your own AI-native product.

```bash
cd examples/smartbooks
pnpm install
pnpm dev
```

Full walkthrough + architecture diagram + custom-frontend gotchas in
[examples/smartbooks/README.md](examples/smartbooks/README.md).

---

## Resources

- **[getsquad.ai](https://getsquad.ai)** — landing page
- **[For Teams](https://getsquad.ai/startups/)** — build AI-native workflows on Squad
- **[Vision essay](https://getsquad.ai/vision/)** — Ship the impossible
- **[Learn guide](https://getsquad.ai/learn/)** — five chapters on building agents
- **[Join the waiting list](https://forms.gle/ac24qrKSufYvfudt8)** — get notified when the app ships

---

## Contributing

Squad is open source under MIT. Issues and PRs welcome.

---

## License

MIT
