# Store Marketplace

Multi-surface marketplace for Houston agents: in-app Store page, website Store section, deep links between them. Mock community agents present today for design validation; real community catalog deferred to a follow-up infra chunk.

## What ships today

### In-app Store page (`app/src/components/store/`)
- Top-level destination in the sidebar between Dashboard and Connections, driven by `viewMode === "store"` in `useUIStore` (not a router).
- Renders the bundled Houston catalog from `useAgentCatalogStore.storeCatalog` plus six hardcoded mock community agents from `mock-catalog.ts`.
- Filters: source (All / Official / Community), pricing (Free / Paid), category, sort (Trending / Newest / Most installs / Top rated).
- Cards: `store-card.tsx` shows badges (Official / Community / Verified / Paid), rating stars, install count, integrations preview.
- Detail: `store-detail-dialog.tsx` with full description, integrations, screenshots, install CTA. Click on a card opens it.
- Trust UI: `install-confirm-dialog.tsx` gates non-Houston installs. Lists the integrations the agent will request and links to GitHub source. Houston agents skip the trust dialog.
- GitHub import: `import-from-url-dialog.tsx` exposes the existing `POST /v1/agents/install-from-github` route in the UI for the first time.
- Mock community installs are disabled with a "Preview, not yet available" message. Nothing fake can reach the engine.

### Deep links (`houston://store/agent/<id>`)
- Routed by the existing `tauri-plugin-deep-link` handler in `app/src-tauri/src/auth.rs::dispatch_deep_link`. The function inspects URL host and forwards to either `store://deep-link` (host `store`) or `auth://deep-link` (everything else).
- Frontend listener in `app/src/lib/store-deep-link.ts` parses the URL, sets `storeAgentId` in the UI store, switches `viewMode` to `"store"`.
- `StorePage` consumes it via `use-store-deep-link.ts`, opens the detail dialog for the matching listing, then clears the id so re-arrivals work.
- Unknown ids surface a localized "agent not yet available" dialog. This is how a website link to an unpublished preview fails gracefully.

### Website Store section (`website/src/store/`)
- `/store/` — landing page with 14-card grid (8 Houston + 6 mock), vanilla-JS client-side filters and search.
- `/store/agent/<id>/` — detail page per agent, generated via Eleventy pagination from `_data/storeCatalog.js`. Primary CTA is the deep link.
- `/store/publish/` — three-step guide for third-party publishing (write `houston.json`, push to GitHub, submit). Submission today is a mailto / GitHub-issue link; self-serve form is a follow-up.
- `_data/storeCatalog.js` reads `store/catalog.json` at build time to merge with the inlined mock list.

## Data shape

`StoreListing` (in `app/src/lib/types.ts`) gained optional fields used only by community entries today:

```ts
source?: "houston" | "community" | "mock";
verified?: boolean;
rating?: number;
reviews_count?: number;
stars?: number;
publisher?: { name; handle?; github_url?; avatar_url?; verified? };
pricing?: { kind: "free" } | { kind: "paid"; price_cents; currency; model };
readme_url?: string;
screenshots?: string[];
```

The engine `StoreListing` (Rust, `engine/houston-engine-core/src/store.rs`) is unchanged. When the remote catalog endpoint ships, extend the Rust type with these same fields and `serde` deserialization picks them up.

## Mock community agents

Six fictional agents inlined in two places (deliberate duplication, single-source comes later):

- `app/src/components/store/mock-catalog.ts` — for the in-app Store
- `website/src/_data/storeCatalog.js` — for the website (verbatim copy of the same data)

Ids: `mock-recruiter-pro`, `mock-content-studio`, `mock-analytics-wizard`, `mock-invoice-hunter`, `mock-meeting-scribe`, `mock-customer-insights`. Mix of free and paid, verified and unverified, varying install counts and ratings to exercise the visual states.

**Never installable.** Detail dialog detects `id.startsWith("mock-")` and disables the install button. Website deep links to these ids hit the "not yet available" fallback in the app.

## Routing and view-mode wiring

- Sidebar entry: `app/src/components/shell/sidebar.tsx` adds `{ id: "store", ... }` between Dashboard and Connections.
- `workspace-shell.tsx` renders `<StorePage />` when `viewMode === "store"`. The `isAgentView` predicate excludes `"store"` so agent tabs do not show.
- i18n: namespace `store` registered in `app/src/lib/i18n.ts` and `app/src/types/react-i18next.d.ts`. Locale files in `app/src/locales/{en,es,pt}/store.json`. `pnpm check-locales` enforces parity and the no-em-dash rule.

## Not yet built (deferred infra)

These are intentionally out of scope until the in-product surface has been validated. Each entry summarizes the work and where it would land.

1. **Remote catalog endpoint** (`store.gethouston.ai/api`). Engine already calls it with bundled-first fallback in `engine/houston-engine-core/src/store.rs::fetch_catalog`. Today bundled always wins because the binary ships with the JSON. Switch to remote-first (with bundled fallback for offline) once the endpoint exists. Stand-up work: Cloudflare Worker over R2 serving `/api/catalog`, `/api/search`, `/api/agents/:id/install`. Engine change is a 5-line invert.

2. **Install tracking server**. Client already POSTs to `store_api()/agents/:id/install` on every install (fire-and-forget in `install_agent`). The handler does not exist yet. Same Cloudflare Worker as above; counts dedup by an anonymous install_id persisted in `~/.houston/preferences.json`.

3. **Community catalog repo** (`gethouston/marketplace-catalog`). Public repo holding the canonical `catalog.json`. Submissions are PRs. CI fetches the listed repo, validates `houston.json`, computes `content_hash`, regenerates `catalog.json`, uploads to R2 on merge. Auto-merge if CI green (no manual review for v1).

4. **Self-serve submission form**. Replaces the mailto / issue link on `/store/publish/`. UI shim that opens a PR against the catalog repo with the dev's GitHub URL and category. Backend is GitHub itself.

5. **Verified publisher program**. Houston-curated allowlist in the catalog repo (`verified-publishers.yml`). The UI already supports `publisher.verified` and renders a blue checkmark.

6. **Monetization (paid agents)**. `pricing` schema reserves the shape; UI shows price tags today. Real flow requires Stripe Connect for sellers, license verification at install time, refund flow. Defer until volume justifies it.

7. **Ratings / reviews**. UI renders them when present; no source of truth yet. Likely tied to the same remote catalog server.

8. **Skills marketplace**. Distinct primitive (skills are sub-units inside agents). Out of scope here. Separate KB once we commit to it.

## Security model for community agents

A community agent runs as a Claude Code session with full filesystem access scoped to its `~/.houston/agents/<id>/` directory, plus whatever Composio integrations it requests. A malicious `CLAUDE.md` could prompt-inject the user into approving destructive actions.

The trust UI (`install-confirm-dialog.tsx`) is the first line of defense:
- Lists the integrations the agent will request.
- Links to the source on GitHub before install.
- Forces an explicit confirm.

Future defenses (planned but not built):
- CI lint of `CLAUDE.md` for known prompt-injection patterns (catalog repo gate).
- Verified-publisher checkmark only awarded after manual review.
- Per-integration just-in-time approval (already a Composio guarantee).

## Wiring summary

| Surface | File | Responsibility |
|---------|------|----------------|
| Engine catalog read | `engine/houston-engine-core/src/store.rs` | Bundled-first today, remote-first when server exists |
| Sidebar entry | `app/src/components/shell/sidebar.tsx` | Top-level nav item |
| Page mount | `app/src/components/shell/workspace-shell.tsx` | `viewMode === "store"` branch |
| Store page | `app/src/components/store/store-page.tsx` | Merges real + mock, filters, dialogs |
| Mock data | `app/src/components/store/mock-catalog.ts` | Six community agents |
| Deep link router (Rust) | `app/src-tauri/src/auth.rs` | `dispatch_deep_link` by URL host |
| Deep link listener (TS) | `app/src/lib/store-deep-link.ts` | Sets `storeAgentId`, switches viewMode |
| Deep link consumer | `app/src/components/store/use-store-deep-link.ts` | Opens matching detail dialog |
| Website grid | `website/src/store/index.html` | Public landing |
| Website detail | `website/src/store/agent/agent.njk` | Per-agent pages, deep-link CTA |
| Website data | `website/src/_data/storeCatalog.js` | Build-time merge of real + mock |
| Website nav | `website/src/_includes/nav-landing.njk` | "Store" link |
