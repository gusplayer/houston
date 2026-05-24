pub(crate) const CLAUDE_METHOD_MD: &str = include_str!("../templates/claude-method.md");
pub(crate) const METHOD_CONFIG: &str = include_str!("../templates/claude/method.config");
pub(crate) const RULES_MD: &str = include_str!("../templates/claude/rules.md");
pub(crate) const COMMAND_INTEGRATE: &str =
    include_str!("../templates/claude/commands/integrate.md");
pub(crate) const HOOK_GATE_MERGE: &str = include_str!("../templates/claude/hooks/gate-merge.sh");
pub(crate) const AGENT_CODE_REVIEWER: &str =
    include_str!("../templates/claude/agents/code-reviewer.md");
pub(crate) const AGENT_QA_VALIDATOR: &str =
    include_str!("../templates/claude/agents/qa-validator.md");
pub(crate) const AGENT_INTEGRATOR: &str = include_str!("../templates/claude/agents/integrator.md");

/// Ordered list of (relative path inside the project, template content) pairs.
/// Order matters only for human readability of seed reports.
pub(crate) const TEMPLATES: &[(&str, &str)] = &[
    ("claude-method.md", CLAUDE_METHOD_MD),
    (".claude/method.config", METHOD_CONFIG),
    (".claude/rules.md", RULES_MD),
    (".claude/commands/integrate.md", COMMAND_INTEGRATE),
    (".claude/hooks/gate-merge.sh", HOOK_GATE_MERGE),
    (".claude/agents/code-reviewer.md", AGENT_CODE_REVIEWER),
    (".claude/agents/qa-validator.md", AGENT_QA_VALIDATOR),
    (".claude/agents/integrator.md", AGENT_INTEGRATOR),
];
