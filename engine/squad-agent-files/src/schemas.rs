//! Embedded JSON Schemas, sourced from `ui/agent-schemas/src/*.schema.json` at compile time.

pub const ACTIVITY: &str = include_str!("../../../ui/agent-schemas/src/activity.schema.json");
pub const ROUTINES: &str = include_str!("../../../ui/agent-schemas/src/routines.schema.json");
pub const ROUTINE_RUNS: &str = include_str!("../../../ui/agent-schemas/src/routine_runs.schema.json");
pub const CONFIG: &str = include_str!("../../../ui/agent-schemas/src/config.schema.json");
pub const LEARNINGS: &str = include_str!("../../../ui/agent-schemas/src/learnings.schema.json");
pub const MCPS: &str = include_str!("../../../ui/agent-schemas/src/mcps.schema.json");
pub const SPRINTS: &str = include_str!("../../../ui/agent-schemas/src/sprints.schema.json");
pub const STORIES: &str = include_str!("../../../ui/agent-schemas/src/stories.schema.json");
pub const TEAM: &str = include_str!("../../../ui/agent-schemas/src/team.schema.json");

pub const ALL: &[(&str, &str)] = &[
    ("activity", ACTIVITY),
    ("routines", ROUTINES),
    ("routine_runs", ROUTINE_RUNS),
    ("config", CONFIG),
    ("learnings", LEARNINGS),
    ("mcps", MCPS),
    ("sprints", SPRINTS),
    ("stories", STORIES),
    ("team", TEAM),
];
