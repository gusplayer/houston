/**
 * SquadTerminal — xterm.js component connected to a Squad Engine PTY WebSocket.
 *
 * Wire protocol:
 *   client → server: Binary frames (raw keystrokes / paste)
 *                    Text frames {"type":"resize","cols":N,"rows":N}
 *   server → client: Binary frames (raw ANSI terminal output)
 *                    Text frames {"type":"exit","code":N} | {"type":"error","message":"..."}
 */
import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
// Consumers must import "@xterm/xterm/css/xterm.css" in their app-level CSS or
// entry point. We cannot import it here because TypeScript in library mode
// rejects side-effect CSS imports without special tsconfig configuration.

export interface SquadTerminalProps {
  /** WebSocket URL — include `?token=<bearer>` for auth. */
  wsUrl: string;
  /** Called when the remote process exits with the given code. */
  onExit?: (code: number) => void;
  /** Called when the WS connection is closed for any reason (user-initiated or normal exit). */
  onClose?: () => void;
  className?: string;
}

export function SquadTerminal({ wsUrl, onExit, onClose, className }: SquadTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Stable refs so effects don't re-run on callback identity changes.
  const onExitRef = useRef(onExit);
  const onCloseRef = useRef(onClose);
  onExitRef.current = onExit;
  onCloseRef.current = onClose;
  // Track whether onerror fired so onclose knows not to call onClose automatically.
  const hadConnectionErrorRef = useRef(false);

  useEffect(() => {
    hadConnectionErrorRef.current = false;
    setErrorMessage(null);

    const container = containerRef.current;
    if (!container) return;

    // Everything in this effect runs defensively: an xterm/WS init crash
    // here would otherwise propagate up and tear down the entire chat
    // subtree (blank screen + chat panel closes, per the original bug
    // report). We catch locally and show an inline error overlay.
    let term: Terminal | undefined;
    let fitAddon: FitAddon | undefined;
    let ws: WebSocket | undefined;
    let observer: ResizeObserver | undefined;
    let onDataDisposer: { dispose: () => void } | undefined;
    let onBinaryDisposer: { dispose: () => void } | undefined;
    let rafHandle: number | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let connect: () => void = () => {};
    // Set true when WE tear the socket down (cleanup/detach) or on a real
    // process exit — so the close handler does NOT treat it as a drop and
    // either reconnect or bubble onClose (which would hide the panel).
    let intentionalClose = false;
    // Flips to true on cleanup. xterm internals (RenderService listeners,
    // DPR observer, queued render frames) can fire one more time AFTER
    // term.dispose() and hit the "undefined is not an object (evaluating
    // 'this._renderer.value.dimensions')" race. The flag lets our own
    // callbacks short-circuit so we don't pile more access on top.
    let isDisposed = false;

    try {
      term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", ui-monospace, monospace',
        theme: {
          background: "hsl(var(--background))",
          foreground: "hsl(var(--foreground))",
          cursor: "hsl(var(--foreground))",
          black: "#000000",
          red: "#ef4444",
          green: "#22c55e",
          yellow: "#eab308",
          blue: "#3b82f6",
          magenta: "#a855f7",
          cyan: "#06b6d4",
          white: "#d1d5db",
          brightBlack: "#6b7280",
          brightRed: "#f87171",
          brightGreen: "#4ade80",
          brightYellow: "#fde047",
          brightBlue: "#60a5fa",
          brightMagenta: "#c084fc",
          brightCyan: "#22d3ee",
          brightWhite: "#f9fafb",
        },
      });

      fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(container);

      // Defer the initial fit() to the next animation frame. fitAddon.fit()
      // reads container dimensions; if the container is mid-transition
      // (just mounted, layout not yet computed), it can throw and crash
      // the whole component.
      rafHandle = requestAnimationFrame(() => {
        try {
          fitAddon?.fit();
        } catch (e) {
          console.error("[SquadTerminal] Initial fit failed:", e);
        }
        if (ws && ws.readyState === WebSocket.OPEN && term) {
          try {
            const { cols, rows } = term;
            ws.send(JSON.stringify({ type: "resize", cols, rows }));
          } catch (e) {
            console.error("[SquadTerminal] Initial resize send failed:", e);
          }
        }
      });

      // Reconnect bookkeeping. Switching agents tears down one socket and
      // opens another in the same tick, which intermittently loses the new
      // connection (the "Failed to connect" the user hit on agent switch).
      // Rather than surface that race, we retry a few times with a short
      // backoff — the engine session persists, so a retry reattaches and
      // replays scrollback. Only after the budget is exhausted do we show
      // the error overlay.
      let retries = 0;
      const MAX_RETRIES = 4;

      const scheduleReconnect = () => {
        if (isDisposed || intentionalClose) return;
        if (retries >= MAX_RETRIES) {
          hadConnectionErrorRef.current = true;
          setErrorMessage("Failed to connect to terminal");
          return;
        }
        retries += 1;
        reconnectTimer = setTimeout(connect, 250 * retries);
      };

      connect = () => {
        if (isDisposed) return;
        ws = new WebSocket(wsUrl);
        ws.binaryType = "arraybuffer";

        ws.onopen = () => {
          retries = 0; // fresh budget for any later drop
          hadConnectionErrorRef.current = false;
          setErrorMessage(null);
          if (!ws || !term) return;
          try {
            const { cols, rows } = term;
            ws.send(JSON.stringify({ type: "resize", cols, rows }));
          } catch (e) {
            console.error("[SquadTerminal] onopen resize send failed:", e);
          }
        };

        ws.onmessage = (evt) => {
          if (!term) return;
          if (evt.data instanceof ArrayBuffer) {
            term.write(new Uint8Array(evt.data));
          } else if (typeof evt.data === "string") {
            try {
              const msg = JSON.parse(evt.data) as {
                type: string;
                code?: number;
                message?: string;
              };
              if (msg.type === "exit") {
                // Real process exit — don't reconnect.
                intentionalClose = true;
                onExitRef.current?.(msg.code ?? 0);
                onCloseRef.current?.();
              } else if (msg.type === "error") {
                intentionalClose = true;
                hadConnectionErrorRef.current = true;
                setErrorMessage(msg.message ?? "Terminal failed to start");
              }
            } catch {
              // ignore malformed control frames
            }
          }
        };

        ws.onerror = () => {
          // onclose fires right after; let it decide whether to retry.
        };

        ws.onclose = () => {
          if (intentionalClose || isDisposed) return;
          // Either the cross-agent connect race (never opened) or a dropped
          // socket on a still-live engine session. Retry; reattach replays
          // scrollback so the screen self-heals.
          scheduleReconnect();
        };
      };

      connect();

      // Forward keystrokes to the server as binary frames.
      onDataDisposer = term.onData((data) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(new TextEncoder().encode(data));
        }
      });

      // Send binary paste as-is.
      onBinaryDisposer = term.onBinary((data) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          const bytes = Uint8Array.from(data, (c) => c.charCodeAt(0));
          ws.send(bytes);
        }
      });

      // Refit on container resize. Skip entirely once the effect has been
      // torn down — a ResizeObserver callback can fire after cleanup runs
      // (browsers batch them on the next layout), and touching a disposed
      // xterm renderer is what the famous `_renderer.value.dimensions`
      // crash boils down to.
      observer = new ResizeObserver(() => {
        if (isDisposed) return;
        try {
          fitAddon?.fit();
          if (ws && ws.readyState === WebSocket.OPEN && term) {
            const { cols, rows } = term;
            ws.send(JSON.stringify({ type: "resize", cols, rows }));
          }
        } catch {
          // fitAddon may throw if the terminal was disposed
        }
      });
      observer.observe(container);
    } catch (e) {
      console.error("[SquadTerminal] init failed:", e);
      // Best-effort cleanup of anything that was created before the throw.
      try { onDataDisposer?.dispose(); } catch {}
      try { onBinaryDisposer?.dispose(); } catch {}
      try { observer?.disconnect(); } catch {}
      try { ws?.close(); } catch {}
      try { term?.dispose(); } catch {}
      if (rafHandle !== undefined) cancelAnimationFrame(rafHandle);
      hadConnectionErrorRef.current = true;
      setErrorMessage("Terminal failed to initialize");
      return;
    }

    return () => {
      isDisposed = true;
      // This is a detach, not a session end: mark it so the close handler
      // neither reconnects nor calls onClose (which would hide the panel).
      intentionalClose = true;
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      if (rafHandle !== undefined) cancelAnimationFrame(rafHandle);
      try { observer?.disconnect(); } catch {}
      try { onDataDisposer?.dispose(); } catch {}
      try { onBinaryDisposer?.dispose(); } catch {}
      try { ws?.close(); } catch {}
      try { term?.dispose(); } catch {}
    };
  // Re-mount only when the WS URL changes (new agent or reconnect).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsUrl]);

  if (errorMessage) {
    return (
      <div
        className={className}
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          fontSize: "13px",
          color: "hsl(var(--muted-foreground))",
          background: "hsl(var(--background))",
        }}
      >
        <span style={{ color: "hsl(var(--destructive))" }}>{errorMessage}</span>
        <button
          type="button"
          onClick={() => {
            setErrorMessage(null);
            onCloseRef.current?.();
          }}
          style={{
            fontSize: "12px",
            color: "hsl(var(--foreground))",
            textDecoration: "underline",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          Back to chat
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
