//! Parallel-development methodology: file seeding + config parsing.
//!
//! Seeds `.claude/{agents,hooks,commands,rules,method.config}` and
//! `claude-method.md` into a user's project directory. Pure file I/O —
//! no engine wiring. Wiring belongs to consumers (e.g. squad-engine-core).

mod config;
mod seed;
mod templates;

pub use config::{parse_method_config, ConfigError, MethodConfig};
pub use seed::{seed_project_methodology, SeedError, SeedOptions, SeedReport};
