/**
 * G.2 — team recommendations.
 *
 * Looks at the workspace's projects and decides which roles from the
 * team library (G.1) should be highlighted as "Recommended" in the
 * Recruit Team dialog. Deliberately deterministic — we read package
 * manifests and config files, no LLM call. The user can always
 * override the recommendation by checking/unchecking.
 *
 * Two universally-useful roles (CTO + QA) are always recommended.
 * Everything else is keyed off stack signals.
 */
import { tauriAgent } from "./tauri";
import type { Project } from "@squad/engine-client";

/** Built-in role IDs from app/src/agents/builtin/. */
export const ROLE_IDS = [
  "cto-agent",
  "mobile-lead-agent",
  "backend-lead-agent",
  "frontend-lead-agent",
  "designer-agent",
  "qa-agent",
  "devops-agent",
] as const;
export type RoleId = (typeof ROLE_IDS)[number];

interface StackSignals {
  hasReactNative: boolean;
  hasExpo: boolean;
  hasNext: boolean;
  hasAstro: boolean;
  hasNuxt: boolean;
  hasNest: boolean;
  hasFastify: boolean;
  hasExpress: boolean;
  hasPrisma: boolean;
  hasDockerfile: boolean;
  hasGithubActions: boolean;
}

async function readPackageJson(
  repoPath: string,
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await tauriAgent.readFile(repoPath, "package.json");
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function fileExists(repoPath: string, relPath: string): Promise<boolean> {
  try {
    const raw = await tauriAgent.readFile(repoPath, relPath);
    return !!raw;
  } catch {
    return false;
  }
}

function depsContain(pkg: Record<string, unknown> | null, key: string): boolean {
  if (!pkg) return false;
  const deps = (pkg.dependencies as Record<string, unknown>) ?? {};
  const dev = (pkg.devDependencies as Record<string, unknown>) ?? {};
  return key in deps || key in dev;
}

async function detectSignals(project: Project): Promise<StackSignals> {
  const pkg = await readPackageJson(project.repoPath);
  const [prisma, dockerfile, ghActions] = await Promise.all([
    fileExists(project.repoPath, "prisma/schema.prisma"),
    fileExists(project.repoPath, "Dockerfile"),
    fileExists(project.repoPath, ".github/workflows"),
  ]);
  return {
    hasReactNative: depsContain(pkg, "react-native"),
    hasExpo: depsContain(pkg, "expo"),
    hasNext: depsContain(pkg, "next"),
    hasAstro: depsContain(pkg, "astro"),
    hasNuxt: depsContain(pkg, "nuxt") || depsContain(pkg, "nuxt3"),
    hasNest: depsContain(pkg, "@nestjs/core"),
    hasFastify: depsContain(pkg, "fastify"),
    hasExpress: depsContain(pkg, "express"),
    hasPrisma: prisma || depsContain(pkg, "@prisma/client"),
    hasDockerfile: dockerfile,
    hasGithubActions: ghActions,
  };
}

function rolesForSignals(s: StackSignals): RoleId[] {
  const roles = new Set<RoleId>();
  // Universally useful — every team benefits.
  roles.add("cto-agent");
  roles.add("qa-agent");

  if (s.hasReactNative || s.hasExpo) roles.add("mobile-lead-agent");
  if (s.hasNext || s.hasAstro || s.hasNuxt) roles.add("frontend-lead-agent");
  if (s.hasNest || s.hasFastify || s.hasExpress || s.hasPrisma) {
    roles.add("backend-lead-agent");
  }
  if (s.hasDockerfile || s.hasGithubActions) roles.add("devops-agent");

  return Array.from(roles);
}

export interface TeamRecommendation {
  recommended: Set<RoleId>;
  /** Per-project signals — surfaced in the UI as "Why?" tooltips. */
  perProject: Array<{ project: Project; signals: StackSignals; roles: RoleId[] }>;
}

/**
 * Inspect every workspace project, merge signals, and return the
 * recommended role set. Falls back to CTO + Designer when no projects
 * exist (a brand-new workspace with no repos bound).
 */
export async function recommendTeam(projects: Project[]): Promise<TeamRecommendation> {
  if (projects.length === 0) {
    return {
      recommended: new Set<RoleId>(["cto-agent", "designer-agent"]),
      perProject: [],
    };
  }

  const perProject = await Promise.all(
    projects.map(async (project) => {
      const signals = await detectSignals(project);
      return { project, signals, roles: rolesForSignals(signals) };
    }),
  );

  const merged = new Set<RoleId>();
  perProject.forEach((p) => p.roles.forEach((r) => merged.add(r)));

  return { recommended: merged, perProject };
}
