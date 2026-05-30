//! Auto-review of a spec + derived tests file by Jeff QA. Phase 4 of the
//! auto-spec flow: if the spec is structurally complete (objective filled,
//! EARS criteria present, expected tests listed, no open questions) and the
//! tests file maps to those criteria, Jeff returns `approve: true` and the
//! caller flips the spec's frontmatter to `approved_by: jeff-qa`.
//!
//! This is a heuristic LLM completeness check — NOT a real test-runner
//! integration. The honest framing is: "Jeff inspects the artifacts as a
//! reviewer would; running the tests is a future step."

use super::cli_runner::run_provider;
use crate::error::CoreResult;
use serde::{Deserialize, Serialize};
use squad_terminal_manager::Provider;
use std::time::Duration;

const REVIEW_TIMEOUT: Duration = Duration::from_secs(45);

/// JSON contract Jeff returns. Kept tiny so the LLM has no excuse to drift.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QaReviewResult {
    pub approve: bool,
    /// Short reasons (1-3 bullets). When `approve` is false these explain
    /// what's missing so the user can address them.
    #[serde(default)]
    pub reasons: Vec<String>,
}

/// Ask Jeff QA whether the spec + tests are complete enough to approve.
/// `tests_body` may be empty when no tests file was generated; Jeff treats
/// that as a "no" by default.
pub async fn qa_review_spec(
    spec_body: &str,
    tests_body: &str,
    provider: Provider,
    model: Option<&str>,
) -> CoreResult<QaReviewResult> {
    let prompt = review_prompt(spec_body, tests_body);
    let raw = run_provider(&prompt, provider, model, REVIEW_TIMEOUT)
        .await
        .map_err(crate::error::CoreError::Internal)?;
    parse_review(&raw)
}

fn review_prompt(spec_body: &str, tests_body: &str) -> String {
    let tests_block = if tests_body.trim().is_empty() {
        "(no tests file)".to_string()
    } else {
        tests_body.to_string()
    };
    format!(
        "You are Jeff, the QA engineer. Review the SDD spec and its derived tests file. Decide whether they are complete enough to approve.\n\n\
         Checklist (all MUST hold for approval):\n\
         1. The Objective is a concrete one or two sentences (not placeholder).\n\
         2. The Scope has at least one bullet under In and one under Out.\n\
         3. Acceptance criteria (EARS) has at least one WHEN/IF/WHILE bullet, each phrased correctly.\n\
         4. Expected tests has at least one bullet per acceptance criterion.\n\
         5. The Open questions section is absent OR empty.\n\
         6. A tests file is present and contains at least one TC- block per criterion.\n\n\
         Output ONLY valid JSON (no code fences, no commentary), shape:\n\
         {{\"approve\": true|false, \"reasons\": [\"...\", \"...\"]}}\n\n\
         When approving, `reasons` may be empty. When rejecting, list 1-3 concrete misses from the checklist.\n\n\
         === SPEC ===\n{spec}\n\n\
         === TESTS ===\n{tests}\n",
        spec = spec_body,
        tests = tests_block,
    )
}

fn parse_review(raw: &str) -> CoreResult<QaReviewResult> {
    let trimmed = raw.trim();
    // Strip a code fence if the model added one despite instructions.
    let cleaned = trimmed
        .strip_prefix("```json\n")
        .or_else(|| trimmed.strip_prefix("```\n"))
        .unwrap_or(trimmed)
        .strip_suffix("\n```")
        .unwrap_or(trimmed);
    serde_json::from_str::<QaReviewResult>(cleaned).map_err(|e| {
        crate::error::CoreError::Internal(format!("qa review parse failed: {e}; raw: {cleaned}"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn review_prompt_includes_spec_and_tests() {
        let prompt = review_prompt("# Spec: A\n...", "# Tests: A\n...");
        assert!(prompt.contains("# Spec: A"));
        assert!(prompt.contains("# Tests: A"));
        assert!(prompt.contains("Checklist"));
        assert!(prompt.contains("\"approve\""));
    }

    #[test]
    fn review_prompt_handles_missing_tests() {
        let prompt = review_prompt("# Spec: A", "");
        assert!(prompt.contains("(no tests file)"));
    }

    #[test]
    fn parse_review_accepts_plain_json() {
        let raw = r##"{"approve": true, "reasons": []}"##;
        let r = parse_review(raw).unwrap();
        assert!(r.approve);
        assert!(r.reasons.is_empty());
    }

    #[test]
    fn parse_review_strips_code_fences() {
        let raw = "```json\n{\"approve\": false, \"reasons\": [\"Objective is placeholder\"]}\n```";
        let r = parse_review(raw).unwrap();
        assert!(!r.approve);
        assert_eq!(r.reasons, vec!["Objective is placeholder".to_string()]);
    }

    #[test]
    fn parse_review_errors_on_garbage() {
        assert!(parse_review("not json").is_err());
    }
}
