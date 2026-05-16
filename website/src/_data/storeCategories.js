// Derived list of unique categories present in storeCatalog, sorted
// alphabetically. Built at the same time as the catalog so templates
// can render category chips without doing array gymnastics in Nunjucks.

import storeCatalog from "./storeCatalog.js";

export default function () {
  const agents = storeCatalog();
  const set = new Set();
  for (const a of agents) {
    if (a.category) set.add(a.category);
  }
  return Array.from(set).sort();
}
