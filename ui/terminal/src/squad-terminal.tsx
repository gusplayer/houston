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

    const term = new Terminal({
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

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      // Send initial terminal size.
      const { cols, rows } = term;
      ws.send(JSON.stringify({ type: "resize", cols, rows }));
    };

    ws.onmessage = (evt) => {
      if (evt.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(evt.data));
      } else if (typeof evt.data === "string") {
        try {
          const msg = JSON.parse(evt.data) as { type: string; code?: number };
          if (msg.type === "exit") {
            onExitRef.current?.(msg.code ?? 0);
          }
        } catch {
          // ignore malformed control frames
        }
      }
    };

    ws.onclose = () => {
      onCloseRef.current?.();
    };

    // Forward keystrokes to the server as binary frames.
    const onData = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(new TextEncoder().encode(data));
      }
    });

    // Send binary paste as-is.
    const onBinary = term.onBinary((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        const bytes = Uint8Array.from(data, (c) => c.charCodeAt(0));
        ws.send(bytes);
      }
    });

    // Refit on container resize.
    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        if (ws.readyState === WebSocket.OPEN) {
          const { cols, rows } = term;
          ws.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      } catch {
        // fitAddon may throw if the terminal was disposed
      }
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      onData.dispose();
      onBinary.dispose();
      ws.close();
      term.dispose();
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
