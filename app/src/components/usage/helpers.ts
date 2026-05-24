import type { Agent } from "../../lib/types";

export function formatUsd(value: number): string {
  if (value < 0.01) return "$0.00";
  if (value < 100) return `$${value.toFixed(2)}`;
  return `$${Math.round(value).toLocaleString()}`;
}

export function formatTokens(n: number): string {
  if (n < 1_000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function resolveAgentName(agents: Agent[], agentPath: string): string {
  const match = agents.find((a) => a.folderPath === agentPath);
  if (match) return match.name;
  // Fall back to the trailing path segment so workspace renames or
  // agents removed from the store still render readable rows.
  const parts = agentPath.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? agentPath;
}
