/**
 * Substitutes the agent config's default persona name (e.g. "Sam") with
 * the name the user actually chose (e.g. "Gus") when seeding CLAUDE.md.
 *
 * Replaces all occurrences so both the heading ("# Sam — CTO") and the
 * body ("You are Sam, the technical lead…") update together.
 *
 * No-ops when either name is empty or they're identical.
 */
export function applyAgentName(
  claudeMd: string | undefined,
  configName: string | undefined,
  agentName: string,
): string | undefined {
  if (!claudeMd || !configName || configName === agentName) return claudeMd;
  return claudeMd.replaceAll(configName, agentName);
}
