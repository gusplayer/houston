//! TDD test-plan derivator — given a spec's EARS body, generates a sibling
//! `<slug>.tests.md` file with one test case per acceptance criterion (red
//! tests first, before the code). Used by Phase 1 of the auto-spec flow.
//!
//! Distinct module from [`super::spec_writer`] because the author is a
//! different agent (Jeff QA), with a TDD-shaped prompt focused on
//! one-to-one mapping from EARS criteria to concrete test cases.

use super::cli_runner::{run_provider, strip_code_fences};
use crate::error::CoreResult;
use squad_terminal_manager::Provider;
use std::time::Duration;

/// 45s — generation is bounded so the call doesn't hang story creation.
const TESTS_TIMEOUT: Duration = Duration::from_secs(45);

/// Generated tests body (no YAML frontmatter — caller wraps).
pub type TestsBody = String;

/// Derive a TDD test plan from an EARS spec.
///
/// `spec_title` is used in the heading and to back-reference the source
/// spec. `spec_body` is the full EARS markdown (without frontmatter) so the
/// model can see the Acceptance criteria section.
pub async fn draft_tests(
    spec_title: &str,
    spec_body: &str,
    provider: Provider,
    model: Option<&str>,
) -> CoreResult<TestsBody> {
    let prompt = tdd_prompt(spec_title, spec_body);
    let raw = run_provider(&prompt, provider, model, TESTS_TIMEOUT)
        .await
        .map_err(crate::error::CoreError::Internal)?;
    Ok(strip_code_fences(raw.trim()).to_string())
}

fn tdd_prompt(spec_title: &str, spec_body: &str) -> String {
    format!(
        "You are Jeff, the QA engineer. Read the SDD spec below and write a concise TDD test plan: one test case per EARS acceptance criterion, in the order they appear. Tests should be red-first — written against the spec BEFORE the code exists.\n\n\
         Output ONLY valid Markdown (no code fences, no surrounding prose) with this EXACT skeleton:\n\n\
         # Tests: {title}\n\n\
         > Derived from `specs/<slug>.md`. Each test maps one-to-one to an acceptance criterion. Red first.\n\n\
         ## Test cases\n\
         For each criterion, output a block of this shape:\n\n\
         ### TC-<n>: <short name>\n\
         - **Criterion**: <the matching WHEN/IF/WHILE clause, copied verbatim>\n\
         - **Setup**: <preconditions / fixtures>\n\
         - **Action**: <what the test does>\n\
         - **Expected**: <what MUST happen>\n\
         - **Type**: unit | integration | e2e\n\n\
         ## Coverage gaps\n\
         - bulleted criteria that have no clean test path (leave the section out if none)\n\n\
         Spec title: {title}\n\
         Spec body:\n{body}\n",
        title = spec_title,
        body = spec_body,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tdd_prompt_references_spec_and_template() {
        let prompt = tdd_prompt(
            "Login page",
            "# Spec: Login page\n## Acceptance criteria (EARS)\n- WHEN user submits valid creds, MUST sign in.",
        );
        assert!(prompt.contains("Login page"));
        assert!(prompt.contains("WHEN user submits valid creds"));
        for section in ["### TC-", "**Criterion**", "**Type**", "## Coverage gaps"] {
            assert!(prompt.contains(section), "missing: {section}");
        }
    }
}
