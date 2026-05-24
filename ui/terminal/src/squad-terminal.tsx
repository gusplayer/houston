/**
 * SquadTerminal — xterm.js component connected to a Squad Engine PTY WebSocket.
 *
 * Wire protocol:
 *   client → server: Binary frames (raw keystrokes / paste)
 *                    Text frames {"type":"resize","cols":N,"rows":N}
 *   server → client: Binary frames (raw ANSI terminal output)
 *                    Text frames {"type":"exit","code":N} | {"type":"error","message":"..."}
 */
import { useEffect, useRef } from "react";
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
  /** Called when the WS connection is closed for any reason. */
  onClose?: () => void;
  className?: string;
}

export function SquadTerminal({ wsUrl, onExit, onClose, className }: SquadTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Stable refs so effects don't re-run on callback identity changes.
  const onExitRef = useRef(onExit);
  const onCloseRef = useRef(onClose);
  onExitRef.current = onExit;
  onCloseRef.current = onClose;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Everything in this effect runs defensively: an xterm/WS init crash
    // here would otherwise propagate up and tear down the entire chat
    // subtree (blank screen + chat panel closes, per the original bug
    // report). We catch locally and call onClose so the parent can
    // recover.
    let term: Terminal | undefined;
    let fitAddon: FitAddon | undefined;
    let ws: WebSocket | undefined;
    let observer: ResizeObserver | undefined;
    let onDataDisposer: { dispose: () => void } | undefined;
    let onBinaryDisposer: { dispose: () => void } | undefined;
    let rafHandle: number | undefined;

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

      ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";

      // Defer the initial fit() to the next animation frame. fitAddon.fit()
      // reads container dimensions; if the container is mid-transition
      // (just mounted, layout not yet computed), it can throw and crash
      // the whole component. Same for the initial resize frame we send
      // over the WS.
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

      ws.onopen = () => {
        if (!ws || !term) return;
        try {
          // Send initial terminal size (in case the rAF callback ran
          // before the socket opened).
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
            const msg = JSON.parse(evt.data) as { type: string; code?: number; message?: string };
            if (msg.type === "exit") {
              onExitRef.current?.(msg.code ?? 0);
            } else if (msg.type === "error") {
              term.writeln(`\r\n\x1b[31mFailed to start terminal: ${msg.message ?? "unknown error"}\x1b[0m`);
            }
          } catch {
            // ignore malformed control frames
          }
        }
      };

      ws.onerror = (event) => {
        console.error("[SquadTerminal] WebSocket error:", event);
        // Surface to the parent so it can show a reconnect affordance
        // or fall back to chat view. We don't tear down here — the
        // browser fires onclose right after onerror.
        onCloseRef.current?.();
      };

      ws.onclose = () => {
        onCloseRef.current?.();
      };

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

      // Refit on container resize.
      observer = new ResizeObserver(() => {
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
      // Let the parent know so it can fall back to the chat view.
      onCloseRef.current?.();
      return;
    }

    return () => {
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

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
