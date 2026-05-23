/**
 * Snippet definitions for the Instructions editor toolbar.
 *
 * Snippet body text stays in English — it is content being inserted into the
 * agent's CLAUDE.md, not UI chrome.  Labels are i18n keys resolved by the
 * toolbar component.
 */

export interface Snippet {
  id: string;
  /** i18n key within agents.instructions.snippets.* */
  labelKey: string;
  /** Markdown block to insert at cursor */
  text: string;
}

const UNIVERSAL: Snippet[] = [
  {
    id: "tone",
    labelKey: "tone",
    text: `## Communication style
- Concise and direct — no filler phrases
- Use bullet points for lists, not prose
- Respond in the same language the user writes in`,
  },
  {
    id: "never",
    labelKey: "never",
    text: `## Never do
- Do not make up information — say you don't know
- Do not modify files outside the project directory
- Do not send messages or emails without explicit confirmation`,
  },
  {
    id: "output",
    labelKey: "output",
    text: `## Output format
- Code always in fenced blocks with language specified
- File paths as inline code
- Keep responses under 400 words unless detail is explicitly requested`,
  },
];

const ENGINEERING: Snippet[] = [
  {
    id: "tools",
    labelKey: "tools",
    text: `## Tool preferences
- Prefer existing patterns in the codebase before introducing new deps
- Run tests before declaring something done
- Check types compile before finishing any code change`,
  },
  {
    id: "workflow",
    labelKey: "workflow",
    text: `## Workflow
1. Understand the request fully before writing code
2. Check existing implementations for patterns to follow
3. Make the minimal change that solves the problem
4. Verify with tests or typecheck`,
  },
];

const DESIGN: Snippet[] = [
  {
    id: "design",
    labelKey: "design",
    text: `## Design principles
- Mobile-first, accessible by default (WCAG AA)
- Prefer existing components before creating new ones
- Document design decisions with rationale`,
  },
];

const ASSISTANT: Snippet[] = [
  {
    id: "schedule",
    labelKey: "schedule",
    text: `## Calendar rules
- Always confirm before creating or modifying events
- Include timezone when mentioning times
- Flag conflicts before resolving them`,
  },
  {
    id: "approval",
    labelKey: "approval",
    text: `## Approval required before
- Sending any message on my behalf
- Creating or cancelling meetings
- Any action that affects other people`,
  },
];

const ENGINEERING_ROLES = new Set([
  "CTO",
  "Backend Lead",
  "Frontend Lead",
  "Mobile Lead",
  "Dev",
  "DevOps",
  "QA Engineer",
]);

/** Returns up to 5 snippets relevant to the agent's role. */
export function getSnippetsForRole(roleLabel: string | undefined): Snippet[] {
  const role = roleLabel ?? "";

  let roleSnippets: Snippet[] = [];
  if (ENGINEERING_ROLES.has(role)) {
    roleSnippets = ENGINEERING;
  } else if (role === "UI/UX Designer") {
    roleSnippets = DESIGN;
  } else if (role === "Assistant") {
    roleSnippets = ASSISTANT;
  }

  return [...UNIVERSAL, ...roleSnippets].slice(0, 5);
}
