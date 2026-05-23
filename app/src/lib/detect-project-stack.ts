/**
 * detect-project-stack.ts
 *
 * Scans a project's root directory for well-known stack markers and
 * returns a structured ProjectStack describing the detected technology.
 * Uses tauriShell.run to read files via the engine's shell endpoint.
 */

import { tauriShell } from "./tauri";

export interface ProjectStack {
  language: string;
  frameworks: string[];
  /** Human-readable dot-separated summary, max 4 items. */
  raw: string;
}

async function readFile(repoPath: string, filename: string): Promise<string | null> {
  try {
    return await tauriShell.run(repoPath, `cat ${filename}`);
  } catch {
    // Legitimate "file not present" outcome — caller falls through to the
    // next detector. We intentionally don't log here because every detector
    // probes for files that may not exist (package.json, Cargo.toml, ...).
    return null;
  }
}

async function fileExists(repoPath: string, filename: string): Promise<boolean> {
  const content = await readFile(repoPath, filename);
  return content !== null;
}

function buildRaw(parts: string[]): string {
  return parts.slice(0, 4).join(" · ");
}

export async function detectProjectStack(repoPath: string): Promise<ProjectStack | null> {
  // 1. package.json → Node.js
  const packageJson = await readFile(repoPath, "package.json");
  if (packageJson !== null) {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(packageJson) as Record<string, unknown>;
    } catch (err) {
      // Malformed package.json — still treat as a Node project so the user
      // gets *something*, but log so they (or a maintainer) can see the
      // framework detection skipped due to bad JSON.
      console.warn("detect-project-stack: malformed package.json, skipping framework detection", err);
    }
    const deps: Record<string, unknown> = {
      ...((parsed.dependencies as Record<string, unknown>) ?? {}),
      ...((parsed.devDependencies as Record<string, unknown>) ?? {}),
    };
    const has = (pkg: string) => pkg in deps;

    const language = has("typescript") ? "TypeScript" : "JavaScript";
    const frameworks: string[] = [];

    if (has("next")) frameworks.push("Next.js");
    else if (has("react") || has("react-dom")) frameworks.push("React");

    if (has("nuxt")) frameworks.push("Nuxt");
    else if (has("vue")) frameworks.push("Vue");

    if (has("@sveltejs/kit")) frameworks.push("SvelteKit");
    else if (has("svelte")) frameworks.push("Svelte");

    if (has("@angular/core")) frameworks.push("Angular");

    if (frameworks.length === 0 && has("vite")) frameworks.push("Vite");

    return {
      language,
      frameworks,
      raw: buildRaw([language, ...frameworks]),
    };
  }

  // 2. Cargo.toml → Rust
  const cargoToml = await readFile(repoPath, "Cargo.toml");
  if (cargoToml !== null) {
    const frameworks: string[] = [];
    if (/\baxum\b/.test(cargoToml)) frameworks.push("axum");
    if (/\bactix-web\b/.test(cargoToml)) frameworks.push("actix-web");
    if (/\brocket\b/.test(cargoToml)) frameworks.push("Rocket");
    if (/\btauri\b/.test(cargoToml)) frameworks.push("Tauri");
    return { language: "Rust", frameworks, raw: buildRaw(["Rust", ...frameworks]) };
  }

  // 3. pyproject.toml or requirements.txt → Python
  const pyproject = await readFile(repoPath, "pyproject.toml");
  const requirements = await readFile(repoPath, "requirements.txt");
  const pyContent = (pyproject ?? "") + (requirements ?? "");
  if (pyproject !== null || requirements !== null) {
    const frameworks: string[] = [];
    if (/django/i.test(pyContent)) frameworks.push("Django");
    if (/flask/i.test(pyContent)) frameworks.push("Flask");
    if (/fastapi/i.test(pyContent)) frameworks.push("FastAPI");
    if (/pytorch|torch/i.test(pyContent)) frameworks.push("PyTorch");
    if (/numpy/i.test(pyContent)) frameworks.push("NumPy");
    return { language: "Python", frameworks, raw: buildRaw(["Python", ...frameworks]) };
  }

  // 4. go.mod → Go
  const goMod = await readFile(repoPath, "go.mod");
  if (goMod !== null) {
    const match = /^module\s+(\S+)/m.exec(goMod);
    const module = match ? match[1] : "";
    const frameworks: string[] = [];
    if (/gin-gonic\/gin/.test(goMod)) frameworks.push("Gin");
    if (/labstack\/echo/.test(goMod)) frameworks.push("Echo");
    return {
      language: "Go",
      frameworks,
      raw: buildRaw(["Go", ...(module ? [module] : []), ...frameworks]),
    };
  }

  // 5. Gemfile → Ruby
  const gemfile = await readFile(repoPath, "Gemfile");
  if (gemfile !== null) {
    const frameworks: string[] = [];
    if (/rails/i.test(gemfile)) frameworks.push("Rails");
    return { language: "Ruby", frameworks, raw: buildRaw(["Ruby", ...frameworks]) };
  }

  // 6. composer.json → PHP
  const composerJson = await readFile(repoPath, "composer.json");
  if (composerJson !== null) {
    const frameworks: string[] = [];
    if (/laravel/i.test(composerJson)) frameworks.push("Laravel");
    return { language: "PHP", frameworks, raw: buildRaw(["PHP", ...frameworks]) };
  }

  // 7. build.gradle / pom.xml → Java/Kotlin
  const hasGradle = await fileExists(repoPath, "build.gradle");
  const hasMaven = await fileExists(repoPath, "pom.xml");
  if (hasGradle || hasMaven) {
    const build = hasGradle ? "Gradle" : "Maven";
    return { language: "Java/Kotlin", frameworks: [build], raw: buildRaw(["Java/Kotlin", build]) };
  }

  return null;
}
