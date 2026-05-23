/**
 * useAgentRoleProfile — role-aware content helpers for empty states.
 *
 * These hooks map an agent's roleLabel (from ROLE_LABELS keyed by configId)
 * to role-specific example content shown when a tab has no data yet.
 * Content strings are in English only — they are example defaults, not UI
 * chrome, so they do not flow through i18n.
 */

export interface ExampleRoutine {
  name: string;
  prompt: string;
  cron: string;
  cronLabel: string;
}

export interface RoleFileHints {
  description: string;
  extensions: string[];
}

const ROUTINE_EXAMPLES: Record<string, ExampleRoutine[]> = {
  CTO: [
    {
      name: "Weekly architecture review",
      prompt:
        "Review the current architecture across all active repositories. Flag drift, technical debt hot-spots, and cross-team dependencies that need attention this week.",
      cron: "0 10 * * 1",
      cronLabel: "Mon 10 am",
    },
    {
      name: "Daily standup notes",
      prompt:
        "Summarise yesterday's merged PRs, open blockers, and today's priorities across the team. Output a brief standup note.",
      cron: "0 9 * * 1-5",
      cronLabel: "Weekdays 9 am",
    },
    {
      name: "Monthly tech debt scan",
      prompt:
        "Scan the codebase for TODO/FIXME comments, deprecated dependencies, and files over the 200-line limit. Produce a prioritised list of items to address next sprint.",
      cron: "0 9 1 * *",
      cronLabel: "1st of month 9 am",
    },
  ],
  "UI/UX Designer": [
    {
      name: "Weekly design system audit",
      prompt:
        "Check for components that deviate from the design system tokens (colours, spacing, typography). List inconsistencies with the file and component name.",
      cron: "0 10 * * 1",
      cronLabel: "Mon 10 am",
    },
    {
      name: "Daily design inspiration scrape",
      prompt:
        "Find three recent UI patterns or design case studies relevant to the current project. Summarise what makes each one effective.",
      cron: "0 8 * * *",
      cronLabel: "Daily 8 am",
    },
    {
      name: "Friday design review",
      prompt:
        "Review all design changes merged this week. Check consistency with the style guide and flag anything that needs a follow-up before next sprint.",
      cron: "0 16 * * 5",
      cronLabel: "Fri 4 pm",
    },
  ],
  "Backend Lead": [
    {
      name: "Daily API health check",
      prompt:
        "Review recent API error rates, slow queries, and timeout logs. Summarise any anomalies and suggest root causes.",
      cron: "0 8 * * *",
      cronLabel: "Daily 8 am",
    },
    {
      name: "Weekly dependency audit",
      prompt:
        "Check all backend dependencies for known vulnerabilities and available patch versions. Produce a list of packages that need updating.",
      cron: "0 9 * * 1",
      cronLabel: "Mon 9 am",
    },
    {
      name: "Monthly performance review",
      prompt:
        "Analyse the slowest endpoints and database queries from the past month. Recommend three concrete optimisations with expected impact.",
      cron: "0 10 1 * *",
      cronLabel: "1st of month 10 am",
    },
  ],
  "Frontend Lead": [
    {
      name: "Weekly bundle size check",
      prompt:
        "Compare this week's production bundle size against last week. Flag any increase above 5 % and identify the contributing packages or routes.",
      cron: "0 9 * * 1",
      cronLabel: "Mon 9 am",
    },
    {
      name: "Daily accessibility scan",
      prompt:
        "Run an automated accessibility check on the main user flows. Report any new WCAG violations introduced since yesterday.",
      cron: "0 9 * * 1-5",
      cronLabel: "Weekdays 9 am",
    },
    {
      name: "Friday code review summary",
      prompt:
        "Summarise all frontend PRs merged this week. Highlight patterns, recurring issues, and any architectural decisions that should be documented.",
      cron: "0 15 * * 5",
      cronLabel: "Fri 3 pm",
    },
  ],
  Dev: [
    {
      name: "Daily API health check",
      prompt:
        "Review recent API error rates, slow queries, and timeout logs. Summarise any anomalies and suggest root causes.",
      cron: "0 8 * * *",
      cronLabel: "Daily 8 am",
    },
    {
      name: "Weekly dependency audit",
      prompt:
        "Check all project dependencies for known vulnerabilities and available patch versions. Produce a list of packages that need updating.",
      cron: "0 9 * * 1",
      cronLabel: "Mon 9 am",
    },
    {
      name: "Monthly performance review",
      prompt:
        "Analyse the slowest functions and queries from the past month. Recommend three concrete optimisations with expected impact.",
      cron: "0 10 1 * *",
      cronLabel: "1st of month 10 am",
    },
  ],
  "Mobile Lead": [
    {
      name: "Weekly crash report",
      prompt:
        "Review crash analytics from the past week. Group crashes by type, affected versions, and device models. Prioritise by user impact.",
      cron: "0 9 * * 1",
      cronLabel: "Mon 9 am",
    },
    {
      name: "Daily build status",
      prompt:
        "Check the status of last night's CI builds for iOS and Android. Report any failures with the failing test or build step.",
      cron: "0 9 * * *",
      cronLabel: "Daily 9 am",
    },
    {
      name: "Sprint retrospective notes",
      prompt:
        "Summarise what went well, what slowed the team down, and three action items for next sprint based on this week's commits and issues.",
      cron: "0 16 * * 5",
      cronLabel: "Fri 4 pm",
    },
  ],
  "QA Engineer": [
    {
      name: "Daily test coverage report",
      prompt:
        "Check the current test coverage percentage and compare to yesterday. Flag any files with coverage below 60 % that were modified recently.",
      cron: "0 9 * * *",
      cronLabel: "Daily 9 am",
    },
    {
      name: "Weekly regression summary",
      prompt:
        "Run the regression suite and summarise the results. List any new failures, flaky tests, and tests that were fixed since last week.",
      cron: "0 10 * * 1",
      cronLabel: "Mon 10 am",
    },
    {
      name: "Pre-release checklist",
      prompt:
        "Run through the pre-release QA checklist: smoke tests, accessibility, performance budget, and open high-severity bugs. Produce a go/no-go recommendation.",
      cron: "0 14 * * 5",
      cronLabel: "Fri 2 pm",
    },
  ],
  DevOps: [
    {
      name: "Daily infrastructure health",
      prompt:
        "Check CPU, memory, and disk usage across all production services. Flag anything above 80 % threshold and suggest scaling actions.",
      cron: "0 7 * * *",
      cronLabel: "Daily 7 am",
    },
    {
      name: "Weekly cost report",
      prompt:
        "Summarise cloud spend for the past week broken down by service. Compare to the previous week and flag any unexpected spikes.",
      cron: "0 9 * * 1",
      cronLabel: "Mon 9 am",
    },
    {
      name: "Monthly security audit",
      prompt:
        "Scan infrastructure configs, IAM policies, and dependency trees for security misconfigurations. Produce a prioritised list of remediation items.",
      cron: "0 9 1 * *",
      cronLabel: "1st of month 9 am",
    },
  ],
  Assistant: [
    {
      name: "Morning briefing",
      prompt:
        "Summarise today's calendar, pending tasks, and any important emails or notifications that need a response.",
      cron: "0 8 * * *",
      cronLabel: "Daily 8 am",
    },
    {
      name: "Weekly agenda prep",
      prompt:
        "Review the upcoming week's meetings and tasks. Draft a prioritised agenda and flag any conflicts or missing prep materials.",
      cron: "0 8 * * 1",
      cronLabel: "Mon 8 am",
    },
    {
      name: "Monthly summary",
      prompt:
        "Produce a monthly summary covering completed tasks, key decisions made, and items carried over to next month.",
      cron: "0 8 1 * *",
      cronLabel: "1st of month 8 am",
    },
  ],
};

const FALLBACK_ROUTINES: ExampleRoutine[] = [
  {
    name: "Daily standup",
    prompt:
      "Summarise recent activity, current blockers, and today's priorities.",
    cron: "0 9 * * *",
    cronLabel: "Daily 9 am",
  },
  {
    name: "Weekly review",
    prompt:
      "Review the week's progress, identify what went well, and plan next week's priorities.",
    cron: "0 9 * * 1",
    cronLabel: "Mon 9 am",
  },
  {
    name: "Monthly report",
    prompt:
      "Generate a monthly progress report covering completed work, metrics, and next month's goals.",
    cron: "0 9 1 * *",
    cronLabel: "1st of month 9 am",
  },
];

/**
 * Returns 3 role-specific example routines for the empty state.
 * Falls back to generic examples for unknown roles.
 */
export function useAgentRoleRoutines(
  roleLabel: string | undefined,
): ExampleRoutine[] {
  if (!roleLabel) return FALLBACK_ROUTINES;
  return ROUTINE_EXAMPLES[roleLabel] ?? FALLBACK_ROUTINES;
}

const FILE_HINTS: Record<string, RoleFileHints> = {
  CTO: {
    description: "Architecture docs, decision records, technical specs",
    extensions: ["PDF", "MD", "DOCX"],
  },
  "UI/UX Designer": {
    description: "Mockups, design specs, exported assets",
    extensions: ["PNG", "PDF", "SVG"],
  },
  "Backend Lead": {
    description: "API docs, technical reports, configs",
    extensions: ["MD", "PDF", "TXT"],
  },
  Dev: {
    description: "API docs, technical reports, configs",
    extensions: ["MD", "PDF", "TXT"],
  },
  "Frontend Lead": {
    description: "Component specs, style guides, screenshots",
    extensions: ["MD", "PNG", "PDF"],
  },
  "Mobile Lead": {
    description: "App specs, screenshots, release notes",
    extensions: ["MD", "PNG", "PDF"],
  },
  "QA Engineer": {
    description: "Test reports, bug logs, coverage summaries",
    extensions: ["MD", "CSV", "PDF"],
  },
  DevOps: {
    description: "Runbooks, infra diagrams, incident reports",
    extensions: ["MD", "PDF", "TXT"],
  },
  Assistant: {
    description: "Briefings, agendas, meeting notes, lists",
    extensions: ["MD", "DOCX", "TXT"],
  },
};

const FALLBACK_FILE_HINTS: RoleFileHints = {
  description: "Documents and outputs created by your agent",
  extensions: ["MD", "PDF", "DOCX"],
};

/**
 * Returns role-specific file type hints for the Files tab empty state.
 * Falls back to generic hints for unknown roles.
 */
export function useAgentRoleFileHints(
  roleLabel: string | undefined,
): RoleFileHints {
  if (!roleLabel) return FALLBACK_FILE_HINTS;
  return FILE_HINTS[roleLabel] ?? FALLBACK_FILE_HINTS;
}
