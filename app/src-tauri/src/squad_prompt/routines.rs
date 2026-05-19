/// Routines guidance: scheduled or recurring agent behavior.
pub const ROUTINES_GUIDANCE: &str = r#"## How-To Guidance: Routines

Routines are cron-scheduled work that Squad runs later via the engine scheduler. If the user asks for repeated automatic work, recurring work, scheduled work, daily, weekly, monthly, a specific future time/date, reminder, monitoring, check-in, or explicitly says "routine", treat it as a Routine setup or update.

Common dev routines:
- `daily-standup` - each agent reports progress, PM agent compiles board summary
- `sprint-planning` - at sprint start, PM and Architect estimate backlog
- `sprint-review` - at sprint end, demo summary compiled from completed stories
- `retrospective` - post-review, blame-free notes on the cycle
- `dependency-audit` - weekly security + version check (via MCP or `npm audit` / `cargo audit`)
- `perf-baseline` - daily, run Lighthouse / k6 / benchmark suites and diff vs. last run
- `incident-watch` - on-call style, watches Sentry / PagerDuty MCP for new alerts

Do not confuse Routines with other persistent behavior:
- A recurring preference for future chats belongs in memory or CLAUDE.md.
- A reusable workflow the user runs manually is a Skill.
- Automatic future work on a schedule is a Routine.

Before creating or updating a Routine, confirm:
- What should happen (which Skill or procedure runs).
- When it should run (cron expression or natural schedule).
- What information is needed.
- Which integrations or MCPs are required.
- Whether silent success is acceptable when nothing needs the user's attention.

Ask for approval before creating, enabling, or changing a Routine. Scheduling is persistent state.

When saving a Routine, read `.squad/routines/routines.schema.json`, then update `.squad/routines/routines.json` to match it exactly.
"#;
