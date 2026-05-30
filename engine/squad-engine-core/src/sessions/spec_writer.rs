//! SDD spec drafter — generates an EARS-style spec body from a story's title
//! and description by shelling out to the configured agent CLI. Used by
//! Phase 0 of the auto-spec flow; the caller wraps the body in YAML
//! frontmatter and writes it to `<repo>/specs/<slug>.md`.

use super::cli_runner::{run_provider, strip_code_fences};
use crate::error::CoreResult;
use squad_terminal_manager::Provider;
use std::time::Duration;

/// 45s budget — specs are larger than titles, but still bounded so a stuck
/// CLI never holds story creation in limbo.
const SPEC_TIMEOUT: Duration = Duration::from_secs(45);

/// Generated EARS spec body (without YAML frontmatter — the caller wraps it).
pub type SpecBody = String;

/// Draft an EARS spec for a story. Returns the markdown body (no frontmatter).
pub async fn draft_spec(
    title: &str,
    description: &str,
    provider: Provider,
    model: Option<&str>,
) -> CoreResult<SpecBody> {
    let prompt = ears_prompt(title, description);
    let raw = run_provider(&prompt, provider, model, SPEC_TIMEOUT)
        .await
        .map_err(crate::error::CoreError::Internal)?;
    Ok(strip_code_fences(raw.trim()).to_string())
}

fn ears_prompt(title: &str, description: &str) -> String {
    format!(
        "You are Steve, the Product Manager. Draft a concise SDD spec in EARS format from the story below.\n\
         Be specific and concrete. No filler, no marketing copy. If something is genuinely unclear, list it under \"Open questions\".\n\n\
         Output ONLY valid Markdown (no code fences, no surrounding prose) with this EXACT skeleton, filling every section:\n\n\
         # Spec: {title}\n\n\
         ## Objective\n\
         One or two sentences.\n\n\
         ## Scope\n\
         - In: bulleted in-scope items\n\
         - Out: bulleted out-of-scope items\n\n\
         ## Domain / modules touched\n\
         - file/folder paths or modules\n\n\
         ## API contract\n\
         - endpoints, request/response shapes (skip the section if not applicable, never invent)\n\n\
         ## Acceptance criteria (EARS)\n\
         - WHEN <event>, the system MUST <response>.\n\
         - IF <condition>, THEN the system MUST <response>.\n\
         - WHILE <state>, the system MUST <requirement>.\n\n\
         ## Expected tests\n\
         - bulleted test cases derived one-to-one from the criteria above\n\n\
         ## Open questions\n\
         - bulleted clarifications needed (leave the section out if none)\n\n\
         Story title: {title}\n\
         Story description:\n{description}\n",
        title = title,
        description = description,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ears_prompt_includes_title_and_description() {
        let prompt = ears_prompt("Login page", "Users sign in with email + password.");
        assert!(prompt.contains("Login page"));
        assert!(prompt.contains("Users sign in with email + password."));
        for section in [
            "## Objective",
            "## Scope",
            "## Acceptance criteria (EARS)",
            "## Expected tests",
        ] {
            assert!(prompt.contains(section), "missing section: {section}");
        }
    }
}
