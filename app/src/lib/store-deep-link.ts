import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useUIStore } from "../stores/ui";
import { logger } from "./logger";

// Idempotent install flag — mirrors the auth.ts pattern. The deep-link
// plugin only ever needs ONE active listener per channel; React Strict-Mode
// double-mounts and HMR re-runs of `App.tsx` must not stack handlers.
let installed = false;

/**
 * Listen for `store://deep-link` events emitted by the Rust deep-link
 * dispatcher (`app/src-tauri/src/auth.rs::dispatch_deep_link`) for any
 * `houston://store/...` URL.
 *
 * Supported URL shapes:
 *   - `houston://store/agent/<agent-id>` — switch the workspace shell to
 *     the Store view and open the detail dialog for that agent. The
 *     Store page (`store-page.tsx`) reads `storeAgentId` from the UI
 *     store and reacts to it.
 *
 * Idempotent — safe to call more than once per app lifetime.
 */
export async function installStoreDeepLinkListener(): Promise<UnlistenFn> {
  if (installed) return () => {};
  installed = true;

  const unlisten = await listen<string>("store://deep-link", (event) => {
    handleStoreUrl(event.payload);
  });

  return () => {
    unlisten();
    installed = false;
  };
}

/**
 * Pure URL parser for the Store deep-link dispatcher. Exported so unit
 * tests can exercise the parsing + UI-store mutation in isolation, without
 * having to mount the Tauri event listener. Production callers use
 * `installStoreDeepLinkListener` which forwards `event.payload` here.
 */
export function handleStoreUrl(rawUrl: string): void {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch (err) {
    // Malformed URL. The user did NOT initiate this — it came from outside
    // the app (a browser, OS protocol handler, or a third-party paste).
    // Surfacing a toast about a malformed external URL would confuse the
    // user, so we log to the frontend log file (which the bug-report
    // bundler picks up) and drop it. This is the documented exception to
    // the CLAUDE.md "no silent failures" rule: the rule targets
    // user-initiated actions; an external deep link is not one.
    logger.error(`[store-deep-link] failed to parse ${rawUrl}: ${err}`);
    return;
  }

  // Defense in depth: the Rust dispatcher already routes by host
  // (`auth.rs::dispatch_deep_link`), but if anything else ever pushed a
  // payload to the `store://deep-link` channel we still refuse to mutate
  // state on a non-`store` host.
  if (url.host !== "store") {
    logger.warn(`[store-deep-link] unexpected host in ${rawUrl}`);
    return;
  }

  // URL hosts and pathnames are parsed differently across browsers for
  // custom schemes — be permissive on the path. For `houston://store/agent/<id>`:
  //   - parsed.host === "store"
  //   - parsed.pathname === "/agent/<id>"
  // Split and filter empties so leading-slash quirks don't break the match.
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "agent" && parts[1]) {
    const ui = useUIStore.getState();
    ui.setStoreAgentId(decodeURIComponent(parts[1]));
    ui.setViewMode("store");
    return;
  }

  logger.warn(`[store-deep-link] unrecognized URL shape: ${rawUrl}`);
}
