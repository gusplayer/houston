use std::fs;
use std::process::Command;

use squad_methodology::{
    parse_method_config, seed_project_methodology, MethodConfig, SeedOptions, SeedReport,
};
use tempfile::TempDir;

fn seed_into_temp(opts: SeedOptions) -> (TempDir, SeedReport) {
    let tmp = TempDir::new().unwrap();
    let report = seed_project_methodology(tmp.path(), opts).unwrap();
    (tmp, report)
}

const EXPECTED_FILES: &[&str] = &[
    "claude-method.md",
    ".claude/method.config",
    ".claude/rules.md",
    ".claude/commands/integrate.md",
    ".claude/hooks/gate-merge.sh",
    ".claude/agents/code-reviewer.md",
    ".claude/agents/qa-validator.md",
    ".claude/agents/integrator.md",
];

#[test]
fn seed_creates_all_expected_files() {
    let (tmp, report) = seed_into_temp(SeedOptions::default());

    for rel in EXPECTED_FILES {
        let p = tmp.path().join(rel);
        assert!(p.exists(), "expected {rel} to be created");
        let body = fs::read_to_string(&p).unwrap();
        assert!(!body.is_empty(), "{rel} is empty");
    }
    assert_eq!(report.created.len(), EXPECTED_FILES.len());
    assert!(report.skipped.is_empty());
}

#[test]
fn seed_with_force_false_skips_existing() {
    let tmp = TempDir::new().unwrap();
    fs::create_dir_all(tmp.path().join(".claude")).unwrap();
    let rules_path = tmp.path().join(".claude/rules.md");
    fs::write(&rules_path, "CUSTOM CONTENT\n").unwrap();

    let report = seed_project_methodology(tmp.path(), SeedOptions::default()).unwrap();

    assert!(report.skipped.iter().any(|p| p == &rules_path));
    let content = fs::read_to_string(&rules_path).unwrap();
    assert_eq!(content, "CUSTOM CONTENT\n");
}

#[test]
fn seed_with_force_true_overwrites_existing() {
    let tmp = TempDir::new().unwrap();
    fs::create_dir_all(tmp.path().join(".claude")).unwrap();
    let rules_path = tmp.path().join(".claude/rules.md");
    fs::write(&rules_path, "CUSTOM CONTENT\n").unwrap();

    let opts = SeedOptions {
        force: true,
        target_branch: None,
    };
    let report = seed_project_methodology(tmp.path(), opts).unwrap();

    assert!(report.created.iter().any(|p| p == &rules_path));
    let content = fs::read_to_string(&rules_path).unwrap();
    assert_ne!(content, "CUSTOM CONTENT\n");
    assert!(content.contains("Reglas") && content.contains("BLOQUEANTE"));
}

#[test]
fn seed_with_custom_target_branch_writes_into_config() {
    let opts = SeedOptions {
        force: false,
        target_branch: Some("staging".to_string()),
    };
    let (tmp, _) = seed_into_temp(opts);

    let cfg = fs::read_to_string(tmp.path().join(".claude/method.config")).unwrap();
    assert!(cfg.contains("TARGET_BRANCH=staging"));
    assert!(!cfg.contains("TARGET_BRANCH=main"));
}

#[test]
fn seed_with_default_target_branch_keeps_main() {
    let (tmp, _) = seed_into_temp(SeedOptions::default());
    let cfg = fs::read_to_string(tmp.path().join(".claude/method.config")).unwrap();
    assert!(cfg.contains("TARGET_BRANCH=main"));
}

#[test]
fn seed_fails_on_missing_project_path() {
    let tmp = TempDir::new().unwrap();
    let missing = tmp.path().join("nope");
    let err = seed_project_methodology(&missing, SeedOptions::default()).unwrap_err();
    assert!(matches!(
        err,
        squad_methodology::SeedError::ProjectNotFound(_)
    ));
}

#[test]
fn parse_method_config_returns_defaults_when_missing() {
    let tmp = TempDir::new().unwrap();
    let cfg = parse_method_config(&tmp.path().join("nonexistent")).unwrap();
    assert_eq!(cfg, MethodConfig::default());
}

#[test]
fn parse_method_config_reads_custom_values() {
    let tmp = TempDir::new().unwrap();
    let p = tmp.path().join("method.config");
    fs::write(
        &p,
        r#"
# comment line
TARGET_BRANCH=staging
TYPECHECK_CMD="cd app && pnpm tsc --noEmit"
TEST_CMD="cargo test"
BUILD_CMD='cargo build'
LINT_CMD=""
UNKNOWN_KEY=ignored
"#,
    )
    .unwrap();

    let cfg = parse_method_config(&p).unwrap();
    assert_eq!(cfg.target_branch, "staging");
    assert_eq!(cfg.typecheck_cmd, "cd app && pnpm tsc --noEmit");
    assert_eq!(cfg.test_cmd, "cargo test");
    assert_eq!(cfg.build_cmd, "cargo build");
    assert_eq!(cfg.lint_cmd, None);
}

#[test]
fn parse_method_config_sets_lint_when_nonempty() {
    let tmp = TempDir::new().unwrap();
    let p = tmp.path().join("method.config");
    fs::write(&p, "LINT_CMD=\"pnpm lint\"\n").unwrap();
    let cfg = parse_method_config(&p).unwrap();
    assert_eq!(cfg.lint_cmd, Some("pnpm lint".to_string()));
}

#[cfg(unix)]
#[test]
fn gate_merge_hook_is_executable_after_seed() {
    use std::os::unix::fs::PermissionsExt;
    let (tmp, _) = seed_into_temp(SeedOptions::default());
    let hook = tmp.path().join(".claude/hooks/gate-merge.sh");
    let mode = fs::metadata(&hook).unwrap().permissions().mode();
    assert!(
        mode & 0o111 != 0,
        "hook should be executable, mode={mode:o}"
    );
}

#[test]
fn gate_merge_hook_passes_bash_syntax_check() {
    let (tmp, _) = seed_into_temp(SeedOptions::default());
    let hook = tmp.path().join(".claude/hooks/gate-merge.sh");
    let output = Command::new("bash")
        .arg("-n")
        .arg(&hook)
        .output()
        .expect("bash should be available on test platforms");
    assert!(
        output.status.success(),
        "bash -n failed: stderr={}",
        String::from_utf8_lossy(&output.stderr)
    );
}
