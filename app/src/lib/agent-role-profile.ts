/**
 * agent-role-profile — role-aware content helpers for empty states.
 *
 * Maps an agent's configId to role-specific example content shown when a
 * tab has no data yet. User-visible strings (`name`, `prompt`,
 * `description`) live in the agents.json locale files; this module only
 * returns i18n keys (and code-only data like cron schedules and file
 * extensions). The empty-state components resolve the keys via `t()` at
 * render time.
 *
 * Indexed by stable configId, NOT by roleLabel — roleLabel is localized,
 * so it would break lookups under es/pt locales.
 */

export interface ExampleRoutine {
  nameKey: string;
  promptKey: string;
  cron: string;
  cronLabel: string;
}

export interface RoleFileHints {
  descriptionKey: string;
  extensions: string[];
}

const ROUTINE_EXAMPLES: Record<string, ExampleRoutine[]> = {
  "cto-agent": [
    {
      nameKey: "examples.cto-agent.weeklyArch.name",
      promptKey: "examples.cto-agent.weeklyArch.prompt",
      cron: "0 10 * * 1",
      cronLabel: "Mon 10 am",
    },
    {
      nameKey: "examples.cto-agent.dailyStandup.name",
      promptKey: "examples.cto-agent.dailyStandup.prompt",
      cron: "0 9 * * 1-5",
      cronLabel: "Weekdays 9 am",
    },
    {
      nameKey: "examples.cto-agent.monthlyTechDebt.name",
      promptKey: "examples.cto-agent.monthlyTechDebt.prompt",
      cron: "0 9 1 * *",
      cronLabel: "1st of month 9 am",
    },
  ],
  "designer-agent": [
    {
      nameKey: "examples.designer-agent.weeklySystemAudit.name",
      promptKey: "examples.designer-agent.weeklySystemAudit.prompt",
      cron: "0 10 * * 1",
      cronLabel: "Mon 10 am",
    },
    {
      nameKey: "examples.designer-agent.dailyInspiration.name",
      promptKey: "examples.designer-agent.dailyInspiration.prompt",
      cron: "0 8 * * *",
      cronLabel: "Daily 8 am",
    },
    {
      nameKey: "examples.designer-agent.fridayReview.name",
      promptKey: "examples.designer-agent.fridayReview.prompt",
      cron: "0 16 * * 5",
      cronLabel: "Fri 4 pm",
    },
  ],
  "backend-lead-agent": [
    {
      nameKey: "examples.backend-lead-agent.dailyApiHealth.name",
      promptKey: "examples.backend-lead-agent.dailyApiHealth.prompt",
      cron: "0 8 * * *",
      cronLabel: "Daily 8 am",
    },
    {
      nameKey: "examples.backend-lead-agent.weeklyDeps.name",
      promptKey: "examples.backend-lead-agent.weeklyDeps.prompt",
      cron: "0 9 * * 1",
      cronLabel: "Mon 9 am",
    },
    {
      nameKey: "examples.backend-lead-agent.monthlyPerf.name",
      promptKey: "examples.backend-lead-agent.monthlyPerf.prompt",
      cron: "0 10 1 * *",
      cronLabel: "1st of month 10 am",
    },
  ],
  "frontend-lead-agent": [
    {
      nameKey: "examples.frontend-lead-agent.weeklyBundle.name",
      promptKey: "examples.frontend-lead-agent.weeklyBundle.prompt",
      cron: "0 9 * * 1",
      cronLabel: "Mon 9 am",
    },
    {
      nameKey: "examples.frontend-lead-agent.dailyA11y.name",
      promptKey: "examples.frontend-lead-agent.dailyA11y.prompt",
      cron: "0 9 * * 1-5",
      cronLabel: "Weekdays 9 am",
    },
    {
      nameKey: "examples.frontend-lead-agent.fridayReview.name",
      promptKey: "examples.frontend-lead-agent.fridayReview.prompt",
      cron: "0 15 * * 5",
      cronLabel: "Fri 3 pm",
    },
  ],
  "dev-agent": [
    {
      nameKey: "examples.dev-agent.dailyApiHealth.name",
      promptKey: "examples.dev-agent.dailyApiHealth.prompt",
      cron: "0 8 * * *",
      cronLabel: "Daily 8 am",
    },
    {
      nameKey: "examples.dev-agent.weeklyDeps.name",
      promptKey: "examples.dev-agent.weeklyDeps.prompt",
      cron: "0 9 * * 1",
      cronLabel: "Mon 9 am",
    },
    {
      nameKey: "examples.dev-agent.monthlyPerf.name",
      promptKey: "examples.dev-agent.monthlyPerf.prompt",
      cron: "0 10 1 * *",
      cronLabel: "1st of month 10 am",
    },
  ],
  "mobile-lead-agent": [
    {
      nameKey: "examples.mobile-lead-agent.weeklyCrash.name",
      promptKey: "examples.mobile-lead-agent.weeklyCrash.prompt",
      cron: "0 9 * * 1",
      cronLabel: "Mon 9 am",
    },
    {
      nameKey: "examples.mobile-lead-agent.dailyBuild.name",
      promptKey: "examples.mobile-lead-agent.dailyBuild.prompt",
      cron: "0 9 * * *",
      cronLabel: "Daily 9 am",
    },
    {
      nameKey: "examples.mobile-lead-agent.sprintRetro.name",
      promptKey: "examples.mobile-lead-agent.sprintRetro.prompt",
      cron: "0 16 * * 5",
      cronLabel: "Fri 4 pm",
    },
  ],
  "qa-agent": [
    {
      nameKey: "examples.qa-agent.dailyCoverage.name",
      promptKey: "examples.qa-agent.dailyCoverage.prompt",
      cron: "0 9 * * *",
      cronLabel: "Daily 9 am",
    },
    {
      nameKey: "examples.qa-agent.weeklyRegression.name",
      promptKey: "examples.qa-agent.weeklyRegression.prompt",
      cron: "0 10 * * 1",
      cronLabel: "Mon 10 am",
    },
    {
      nameKey: "examples.qa-agent.preRelease.name",
      promptKey: "examples.qa-agent.preRelease.prompt",
      cron: "0 14 * * 5",
      cronLabel: "Fri 2 pm",
    },
  ],
  "devops-agent": [
    {
      nameKey: "examples.devops-agent.dailyInfra.name",
      promptKey: "examples.devops-agent.dailyInfra.prompt",
      cron: "0 7 * * *",
      cronLabel: "Daily 7 am",
    },
    {
      nameKey: "examples.devops-agent.weeklyCost.name",
      promptKey: "examples.devops-agent.weeklyCost.prompt",
      cron: "0 9 * * 1",
      cronLabel: "Mon 9 am",
    },
    {
      nameKey: "examples.devops-agent.monthlySecurity.name",
      promptKey: "examples.devops-agent.monthlySecurity.prompt",
      cron: "0 9 1 * *",
      cronLabel: "1st of month 9 am",
    },
  ],
  "personal-assistant": [
    {
      nameKey: "examples.personal-assistant.morningBriefing.name",
      promptKey: "examples.personal-assistant.morningBriefing.prompt",
      cron: "0 8 * * *",
      cronLabel: "Daily 8 am",
    },
    {
      nameKey: "examples.personal-assistant.weeklyAgenda.name",
      promptKey: "examples.personal-assistant.weeklyAgenda.prompt",
      cron: "0 8 * * 1",
      cronLabel: "Mon 8 am",
    },
    {
      nameKey: "examples.personal-assistant.monthlySummary.name",
      promptKey: "examples.personal-assistant.monthlySummary.prompt",
      cron: "0 8 1 * *",
      cronLabel: "1st of month 8 am",
    },
  ],
};

const FALLBACK_ROUTINES: ExampleRoutine[] = [
  {
    nameKey: "examples.fallback.dailyStandup.name",
    promptKey: "examples.fallback.dailyStandup.prompt",
    cron: "0 9 * * *",
    cronLabel: "Daily 9 am",
  },
  {
    nameKey: "examples.fallback.weeklyReview.name",
    promptKey: "examples.fallback.weeklyReview.prompt",
    cron: "0 9 * * 1",
    cronLabel: "Mon 9 am",
  },
  {
    nameKey: "examples.fallback.monthlyReport.name",
    promptKey: "examples.fallback.monthlyReport.prompt",
    cron: "0 9 1 * *",
    cronLabel: "1st of month 9 am",
  },
];

/**
 * Returns 3 role-specific example routines for the empty state.
 * Falls back to generic examples for unknown configIds.
 */
export function getRoleRoutines(
  configId: string | undefined,
): ExampleRoutine[] {
  if (!configId) return FALLBACK_ROUTINES;
  return ROUTINE_EXAMPLES[configId] ?? FALLBACK_ROUTINES;
}

const FILE_HINTS: Record<string, RoleFileHints> = {
  "cto-agent": {
    descriptionKey: "files.roleHints.cto-agent",
    extensions: ["PDF", "MD", "DOCX"],
  },
  "designer-agent": {
    descriptionKey: "files.roleHints.designer-agent",
    extensions: ["PNG", "PDF", "SVG"],
  },
  "backend-lead-agent": {
    descriptionKey: "files.roleHints.backend-lead-agent",
    extensions: ["MD", "PDF", "TXT"],
  },
  "dev-agent": {
    descriptionKey: "files.roleHints.dev-agent",
    extensions: ["MD", "PDF", "TXT"],
  },
  "frontend-lead-agent": {
    descriptionKey: "files.roleHints.frontend-lead-agent",
    extensions: ["MD", "PNG", "PDF"],
  },
  "mobile-lead-agent": {
    descriptionKey: "files.roleHints.mobile-lead-agent",
    extensions: ["MD", "PNG", "PDF"],
  },
  "qa-agent": {
    descriptionKey: "files.roleHints.qa-agent",
    extensions: ["MD", "CSV", "PDF"],
  },
  "devops-agent": {
    descriptionKey: "files.roleHints.devops-agent",
    extensions: ["MD", "PDF", "TXT"],
  },
  "personal-assistant": {
    descriptionKey: "files.roleHints.personal-assistant",
    extensions: ["MD", "DOCX", "TXT"],
  },
};

const FALLBACK_FILE_HINTS: RoleFileHints = {
  descriptionKey: "files.roleHints.fallback",
  extensions: ["MD", "PDF", "DOCX"],
};

/**
 * Returns role-specific file type hints for the Files tab empty state.
 * Falls back to generic hints for unknown configIds.
 */
export function getRoleFileHints(
  configId: string | undefined,
): RoleFileHints {
  if (!configId) return FALLBACK_FILE_HINTS;
  return FILE_HINTS[configId] ?? FALLBACK_FILE_HINTS;
}
