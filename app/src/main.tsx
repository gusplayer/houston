import {
  Component,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { TooltipProvider } from "@squad/core";
import { queryClient } from "./lib/query-client";
import App from "./App";
import "./styles/globals.css";
import { initFrontendLogging, logger } from "./lib/logger";
import { whenEngineReady, isEngineReady } from "./lib/engine";
import i18n from "./lib/i18n";
import { DisclaimerGate } from "./components/shell/disclaimer-gate";
import { LanguageGate } from "./components/shell/language-gate";
import { showErrorToast } from "./lib/error-toast";
import { analytics, classifyAnalyticsError } from "./lib/analytics";

// Initialize file-based logging — patches console.error/warn to write to
// ~/.squad/logs/frontend.log (or ~/.dev-squad/logs/frontend.log in dev).
initFrontendLogging();

/**
 * Patterns we know are 3rd-party disposal-race noise: not user-initiated,
 * not actionable, fire on unmount and would otherwise toast on every
 * navigation. We still log them and ship them to analytics so they show
 * up in triage — we just don't toast.
 *
 * Current entries:
 *  - xterm's RenderService.dimensions getter dereferences a
 *    MutableDisposable whose `.value` becomes null right after dispose.
 *    Reproduces on every workspace nav with an open terminal. See:
 *    @xterm/xterm RenderService at https://github.com/xtermjs/xterm.js
 */
const SILENT_NOISE_PATTERNS: readonly RegExp[] = [
  /this\._renderer\.value\.dimensions/,
];

function isKnownDisposalNoise(message: string): boolean {
  return SILENT_NOISE_PATTERNS.some((re) => re.test(message));
}

// Global error handlers — surface ALL uncaught errors as toasts
// (console.error calls here also flow to the log file via initFrontendLogging)
window.onerror = (_event, _source, _line, _col, error) => {
  const message = error?.message ?? String(_event);
  console.error("[global:error]", message, error);
  analytics.captureException(error ?? new Error(message), {
    source: "uncaught_error",
    error_kind: classifyAnalyticsError(message),
  });
  if (isKnownDisposalNoise(message)) return;
  showErrorToast("uncaught_error", message);
};

window.onunhandledrejection = (event: PromiseRejectionEvent) => {
  const message = event.reason?.message ?? String(event.reason);
  console.error("[global:unhandledrejection]", message, event.reason);
  analytics.captureException(event.reason, {
    source: "unhandled_rejection",
    error_kind: classifyAnalyticsError(message),
  });
  if (isKnownDisposalNoise(message)) return;
  showErrorToast("unhandled_rejection", message);
};

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) {
    logger.error(`[react-crash] ${error.message}`, error.stack);
    analytics.captureException(error, {
      source: "react_crash",
      error_kind: classifyAnalyticsError(error.message),
    });
    showErrorToast("react_crash", error.message);
  }
  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            padding: 32,
            background: "#1e1e1e",
            color: "#ffdddd",
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: 13,
            whiteSpace: "pre-wrap",
            overflow: "auto",
            zIndex: 999999,
          }}
        >
          <h1 style={{ color: "#ff6666", fontSize: 24, margin: 0, marginBottom: 16 }}>
            App crashed
          </h1>
          <p style={{ fontSize: 15, marginBottom: 16, color: "#ffffff" }}>
            {this.state.error.message}
          </p>
          <pre style={{ fontSize: 12, opacity: 0.85 }}>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Blocks the app from rendering until the Tauri supervisor emits
 * `squad-engine-ready` (or the injection raced in early). Hooks deep in
 * the tree synchronously call `getEngine()` in their first useEffect, so
 * we MUST have the handshake before mounting <App />.
 */
function EngineGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(isEngineReady());
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    whenEngineReady().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  // Locale resolution moved to <LanguageGate>, which both reads the
  // persisted pref and handles the first-run picker. That gate sits
  // inside <I18nextProvider> and owns the full locale story.

  if (!ready) {
    // Use the i18n singleton directly — this renders OUTSIDE
    // <I18nextProvider>, so useTranslation would have no context.
    // The singleton is already initialized synchronously in i18n.ts.
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontFamily: "system-ui, sans-serif",
          color: "#888",
          fontSize: 14,
        }}
      >
        {i18n.t("shell:engineGate.starting")}
      </div>
    );
  }
  return <>{children}</>;
}

// StrictMode intentionally remounts components to catch bugs. In Tauri's
// WKWebView that double-mount collides with portal DOM + Tauri event
// listeners and throws NotFoundError on removeChild. Skipping it for now;
// revisit once the underlying portal/listener churn is fixed.
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary>
      <TooltipProvider>
        <EngineGate>
          <I18nextProvider i18n={i18n}>
            <LanguageGate>
              <DisclaimerGate>
                <App />
              </DisclaimerGate>
            </LanguageGate>
          </I18nextProvider>
        </EngineGate>
      </TooltipProvider>
    </ErrorBoundary>
  </QueryClientProvider>,
);
