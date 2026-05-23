/**
 * inject-stack-section.ts
 *
 * Idempotent helpers to embed / remove a ## Stack section in a CLAUDE.md
 * using HTML-comment markers so the block survives re-runs unchanged.
 */

import type { ProjectStack } from "./detect-project-stack";

const START_MARKER = "<!-- squad:stack-start -->";
const END_MARKER = "<!-- squad:stack-end -->";

function buildBlock(stack: ProjectStack): string {
  return `${START_MARKER}\n## Stack\n${stack.raw}\n${END_MARKER}`;
}

/**
 * Injects or replaces the ## Stack section.
 * - If markers exist: replace the content between them.
 * - If not: append the block at the end with a blank line before it.
 */
export function injectStackSection(claudeMd: string, stack: ProjectStack): string {
  const block = buildBlock(stack);

  if (claudeMd.includes(START_MARKER)) {
    const startIdx = claudeMd.indexOf(START_MARKER);
    const endIdx = claudeMd.indexOf(END_MARKER);
    if (endIdx === -1) {
      // Malformed — just replace from start marker to end of string
      return claudeMd.slice(0, startIdx).trimEnd() + "\n\n" + block;
    }
    const before = claudeMd.slice(0, startIdx).trimEnd();
    const after = claudeMd.slice(endIdx + END_MARKER.length).replace(/^\n/, "");
    return before + "\n\n" + block + (after.length > 0 ? "\n\n" + after.trimStart() : "");
  }

  const trimmed = claudeMd.trimEnd();
  return trimmed.length > 0 ? trimmed + "\n\n" + block : block;
}

/**
 * Removes the ## Stack section including its markers.
 * No-op if markers are not present.
 */
export function removeStackSection(claudeMd: string): string {
  if (!claudeMd.includes(START_MARKER)) return claudeMd;

  const startIdx = claudeMd.indexOf(START_MARKER);
  const endIdx = claudeMd.indexOf(END_MARKER);
  if (endIdx === -1) return claudeMd;

  const before = claudeMd.slice(0, startIdx).trimEnd();
  const after = claudeMd.slice(endIdx + END_MARKER.length).replace(/^\n+/, "");
  if (before.length === 0) return after;
  if (after.length === 0) return before;
  return before + "\n\n" + after;
}
