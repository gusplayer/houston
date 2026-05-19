import { strictEqual } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import { handleStoreUrl } from "../src/lib/store-deep-link.ts";
import { useUIStore } from "../src/stores/ui.ts";

// Snapshot of the UI store fields the parser is allowed to mutate. Used
// before each test to reset state and after each test to assert exactly
// which (if any) keys changed. The real store is a zustand instance that
// works in Node — it doesn't depend on Tauri — so we can drive it directly.
function resetUIStore() {
  useUIStore.setState({ storeAgentId: null, viewMode: "chat" });
}

describe("handleStoreUrl", () => {
  beforeEach(resetUIStore);

  it("valid 'squad://store/agent/<id>' sets storeAgentId and viewMode='store'", () => {
    handleStoreUrl("squad://store/agent/foo");
    const s = useUIStore.getState();
    strictEqual(s.storeAgentId, "foo");
    strictEqual(s.viewMode, "store");
  });

  it("URL-encoded ids are decoded", () => {
    handleStoreUrl("squad://store/agent/mock%2Drecruiter-pro");
    const s = useUIStore.getState();
    strictEqual(s.storeAgentId, "mock-recruiter-pro");
    strictEqual(s.viewMode, "store");
  });

  it("malformed URL string does NOT mutate the UI store", () => {
    handleStoreUrl("not a url");
    const s = useUIStore.getState();
    strictEqual(s.storeAgentId, null);
    strictEqual(s.viewMode, "chat");
  });

  it("wrong host (e.g. 'squad://other/agent/foo') does NOT mutate the UI store", () => {
    // Note: routing-by-host happens in Rust (`dispatch_deep_link`). If a
    // store-channel event ever arrived with a non-store host, the parser
    // should still refuse to mutate state. We test by passing the URL
    // directly to the pure parser.
    handleStoreUrl("squad://other/agent/foo");
    const s = useUIStore.getState();
    strictEqual(s.storeAgentId, null);
    strictEqual(s.viewMode, "chat");
  });

  it("missing agent id ('squad://store/agent/') does NOT mutate the UI store", () => {
    handleStoreUrl("squad://store/agent/");
    const s = useUIStore.getState();
    strictEqual(s.storeAgentId, null);
    strictEqual(s.viewMode, "chat");
  });

  it("empty path ('squad://store/') does NOT mutate the UI store", () => {
    handleStoreUrl("squad://store/");
    const s = useUIStore.getState();
    strictEqual(s.storeAgentId, null);
    strictEqual(s.viewMode, "chat");
  });
});
