#!/usr/bin/env node
// Build-time fetcher: downloads simpleicons SVGs for every entry in
// src/_data/integrationIcons.json into src/integration-icons/<slug>.svg.
//
// Idempotent: skips slugs whose SVG already exists on disk. Safe to wire
// as a `prebuild` step. Aborts (non-zero exit) with a list of missing
// slugs if the CDN returns non-200 so the operator can fix the JSON.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_FILE = path.join(ROOT, "src", "_data", "integrationIcons.json");
const OUT_DIR = path.join(ROOT, "src", "integration-icons");
const CDN = (slug) =>
  `https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/${slug}.svg`;

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const raw = await fs.readFile(DATA_FILE, "utf8");
  const map = JSON.parse(raw);

  await fs.mkdir(OUT_DIR, { recursive: true });

  const failures = [];
  let fetched = 0;
  let skipped = 0;

  for (const [name, entry] of Object.entries(map)) {
    const slug = entry.slug;
    if (!slug) {
      failures.push(`${name}: missing slug`);
      continue;
    }
    const dest = path.join(OUT_DIR, `${slug}.svg`);
    if (await fileExists(dest)) {
      console.log(`[skip]    ${slug}`);
      skipped++;
      continue;
    }
    const url = CDN(slug);
    const res = await fetch(url);
    if (!res.ok) {
      failures.push(`${name} (slug=${slug}): HTTP ${res.status} from ${url}`);
      continue;
    }
    const body = await res.text();
    await fs.writeFile(dest, body, "utf8");
    console.log(`[fetched] ${slug}`);
    fetched++;
  }

  console.log(
    `\nDone. fetched=${fetched} skipped=${skipped} failed=${failures.length}`
  );

  if (failures.length > 0) {
    console.error("\nFailures:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
