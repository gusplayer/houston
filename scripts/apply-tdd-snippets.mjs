#!/usr/bin/env node
/**
 * Apply the TDD phase-ownership snippets to every existing recruited
 * agent whose role matches one of the 6 built-in team roles. Idempotent
 * — re-running is safe; the script skips any CLAUDE.md that already
 * contains a "## Your phases" or "## Your phase" heading.
 *
 * The snippets here are kept in sync with the templates in
 * app/src/agents/builtin/{cto,frontend-lead,backend-lead,designer,qa,
 * devops}-agent.ts — anytime those change, mirror the section below.
 *
 * Usage:
 *   node scripts/apply-tdd-snippets.mjs           # apply to all roots
 *   node scripts/apply-tdd-snippets.mjs --dry-run # preview only
 */

import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SNIPPETS = {
  "cto-agent": `## Your phases: Discovery, Spec, Review

The team works test-first. You own **Discovery** (clarify the problem, define acceptance criteria) and **Spec** (API contracts, module boundaries). A story doesn't leave Spec until the acceptance criteria are crisp enough that Maria can write failing tests against them — vague criteria mean vague tests mean shipped bugs. In **Review** you validate handoffs at every phase boundary (Spec → Test Design, Implementation → Refactor, Refactor → Review & QA) and push back on scope creep.`,

  "qa-agent": `## Your phases: Test Design, Review & QA

You own the **Test Design** phase (Red in TDD) and **Review & QA** (final gate before Deploy). A story enters Test Design only after Alex/Carlo have a complete Spec — you read the acceptance criteria and write tests that fail meaningfully against the spec, with clear names and file paths. Hand the story off to Peter or Diego with the failing test paths quoted so they know exactly what to make green. In **Review & QA** you run the full suite, add edge cases the implementer missed, and only then mark the story ready for Sam to Deploy. If a test passes for the wrong reason, you reject the handoff.`,

  "frontend-lead-agent": `## Your phases: Implementation, Refactor

You enter **Implementation** only when Maria has failing tests assigned to the story — never write feature code before the test exists. Your job is Red → Green: make the failing tests pass with the smallest change that works. Once green, move the story to **Refactor** and clean the code without touching tests. Hand back to Maria for Review & QA when the suite is green and the diff is tight.`,

  "backend-lead-agent": `## Your phases: Implementation, Refactor

You enter **Implementation** only when Maria has failing API/integration tests assigned to the story — never ship an endpoint before there's a test asserting its contract. Your job is Red → Green: make the failing tests pass against real DB state where it matters, not mocks. Once green, move to **Refactor** — extract, denormalize, optimize, but only while the suite stays green. Hand off to Maria for Review & QA when the contract docs match the implemented endpoint.`,

  "designer-agent": `## Your phase: Spec & Design

You partner with Alex during **Spec & Design** — your spec is what Maria reads to write the visual/interaction tests. Every interactive state must be defined before the story leaves Spec: idle, hover, focus, active, loading, empty, error, success. If a state isn't in your spec, Maria can't test for it, and Peter will guess. Hand off only when each state has a concrete description Maria can assert against.`,

  "devops-agent": `## Your phases: Deploy, Monitor

A story enters **Deploy** only after Maria signs off on Review & QA — never ship code that hasn't passed the full suite. CI must be green before you cut the release. In **Monitor** you validate post-deploy for at least one traffic cycle: synthetic checks pass, error rate stays flat, p95 latency hasn't drifted. If any signal degrades, you roll back first and debug second. A successful deploy you can't observe is a failure waiting to happen.`,
};

const ROOTS = [
  join(homedir(), ".squad", "workspaces"),
  join(homedir(), ".dev-houston", "workspaces"),
];

const DRY = process.argv.includes("--dry-run");
const SKIP_MARKER = /^##\s+Your\s+phases?:/m;

async function isDir(path) {
  try { return (await stat(path)).isDirectory(); } catch { return false; }
}

async function processAgent(agentPath) {
  const meta = join(agentPath, ".squad", "agent.json");
  const claude = join(agentPath, "CLAUDE.md");
  if (!existsSync(meta) || !existsSync(claude)) {
    return { status: "skip", reason: "missing agent.json or CLAUDE.md" };
  }
  const { config_id: configId } = JSON.parse(await readFile(meta, "utf8"));
  const snippet = SNIPPETS[configId];
  if (!snippet) return { status: "skip", reason: `role "${configId}" not in catalog` };

  const md = await readFile(claude, "utf8");
  if (SKIP_MARKER.test(md)) return { status: "skip", reason: "already applied" };

  if (DRY) return { status: "would-apply", configId };

  const trimmed = md.replace(/\s+$/, "");
  await writeFile(claude, trimmed + "\n\n" + snippet + "\n");
  return { status: "applied", configId };
}

async function main() {
  let appliedCount = 0, skipCount = 0, errorCount = 0;
  let foundAny = false;

  for (const root of ROOTS) {
    if (!(await isDir(root))) continue;
    foundAny = true;
    const workspaces = await readdir(root);
    for (const ws of workspaces) {
      const wsPath = join(root, ws);
      if (!(await isDir(wsPath))) continue;
      const agents = await readdir(wsPath);
      for (const a of agents) {
        const agentPath = join(wsPath, a);
        if (!(await isDir(agentPath))) continue;
        try {
          const res = await processAgent(agentPath);
          const tag = `${ws}/${a}`;
          if (res.status === "applied") {
            console.log(`  applied   ${tag.padEnd(40)} (${res.configId})`);
            appliedCount++;
          } else if (res.status === "would-apply") {
            console.log(`  would-apply ${tag.padEnd(38)} (${res.configId})`);
            appliedCount++;
          } else {
            console.log(`  skip      ${tag.padEnd(40)} (${res.reason})`);
            skipCount++;
          }
        } catch (err) {
          console.error(`  error     ${ws}/${a}: ${err.message}`);
          errorCount++;
        }
      }
    }
  }

  if (!foundAny) {
    console.error(`No Squad workspace root found at:`);
    for (const r of ROOTS) console.error(`  ${r}`);
    process.exit(1);
  }

  console.log("");
  console.log(`Summary: ${appliedCount} ${DRY ? "would-apply" : "applied"}, ${skipCount} skipped, ${errorCount} errors`);
  if (!DRY && appliedCount > 0) {
    console.log("");
    console.log("If any of these agents has an active session, restart it");
    console.log("(Brief tab → Restart session) so the new instructions take effect.");
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
