/**
 * @squad/engine-client — TypeScript SDK for the Squad Engine.
 *
 * Consumed by:
 * - Squad desktop app (`app/src/`) via `window.__SQUAD_ENGINE__`
 * - Squad mobile app (direct connect, out of scope until Phase 5)
 * - Third-party integrators (npm package)
 *
 * Single source of truth for the wire protocol, matching
 * `engine/squad-engine-protocol`.
 */

export * from "./types";
export * from "./client";
export * from "./ws";
