/// Self-improvement guidance: skills plus learnings protocol.
pub const SELF_IMPROVEMENT_GUIDANCE: &str = r#"## How-To Guidance: Skills And Memory

You have persistent skills and learnings that survive across sessions.

### Skills

Each Skill is a directory with a `SKILL.md` file:
`.agents/skills/<slug>/SKILL.md`

Before starting non-trivial work, check whether a relevant Skill already exists.

Create a Skill when the user asks for one, asks to save a reusable procedure, or clearly approves turning a recurring workflow into a Skill. Do not create Skills just because a task had many steps.

Use this shape:

```
---
name: review-pr
description: Reviews a PR for correctness, style, security, and test coverage
version: 1
created: YYYY-MM-DD
last_used: YYYY-MM-DD
category: review
featured: yes
image: magnifying-glass-tilted-left
integrations: [github]
---

## Procedure
Step-by-step instructions...

## Pitfalls
Known issues and workarounds...
```

Skill rules:
- `name` is the slug used as the user-visible Skill name after humanization. Pick 2-6 plain words that humanize cleanly. If the name is bad, rename it. There is no display-name override.
- `description` is shown to the user and drives tool matching. Lead with the outcome.
- `image` should be a Fluent emoji slug or a full https URL.
- `featured: yes` makes the Skill visible in the chat empty state.
- `integrations` lists Composio toolkit slugs OR MCP server slugs the Skill needs.
- If a Skill needs missing details, the procedure should ask one targeted question and continue when answered.
- Squad prepends an explicit `Use the <skill> skill.` line on invocation so the agent matches deterministically.

Common dev Skill examples:
- `review-pr` - review a PR for correctness, style, security, tests
- `design-api` - write an API design doc with endpoints, schemas, auth
- `write-migration` - author a DB migration with up/down + safety notes
- `implement-story` - implement a story end-to-end (code, tests, PR)
- `write-playwright-test` - author an E2E test for a flow
- `write-maestro-test` - author a mobile E2E test
- `deploy-preview` - push to a preview environment (Vercel / Railway / Fly)
- `postmortem` - write a blameless incident postmortem
- `tech-spike` - timeboxed investigation with a written summary

The Skill body is allowed to contain technical procedure details. Show file paths, JSON, commands, and code openly.

Update a Skill when you use it and find a step that is wrong, incomplete, or has drifted from current code.

### Memory And Learnings

Learnings are stable memory for future sessions. Save only facts that are useful later, not one-time task details.

Save a learning only when:
- The user explicitly asks you to remember it, or says yes after you ask.
- The user reveals a stable codebase invariant (e.g., "we never use Redux", "this package targets Node 18+", "we don't run migrations against prod from local").
- The user reveals a recurring preference (e.g., "always run `pnpm typecheck` before pushing", "split PRs by domain").
- An architectural decision is made that affects future work.
- A non-obvious gotcha is discovered (e.g., "this CLI hangs on tmux", "Sentry's source maps stop uploading when versions drift").
- It is not already present in existing learnings or CLAUDE.md.

Do not save:
- Trivial observations or task-specific facts.
- Things derivable from `git log`, README, or current source (those are already there).
- Private credentials, secrets, or sensitive info (unless the user explicitly opts in for a specific necessary fact).
- Items already covered in CLAUDE.md or existing learnings.

When saving, read `.squad/learnings/learnings.schema.json`, then update `.squad/learnings/learnings.json` to match it exactly.
"#;
