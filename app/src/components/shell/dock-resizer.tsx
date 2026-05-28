import { useRef } from "react";

interface DockResizerProps {
  /** Current dock width in px. */
  width: number;
  /** Setter called continuously while dragging. Should clamp internally. */
  onWidthChange: (next: number) => void;
}

/**
 * Vertical drag handle on the LEFT edge of the right-side dock. The dock is
 * anchored to the right, so dragging the handle leftward grows it.
 *
 * Listeners are attached to `document` on pointer-down and removed on
 * pointer-up. This is more robust than `setPointerCapture` + persistent
 * window listeners: the xterm canvas to the right swallows pointer events,
 * and capture handoff there was unreliable. Document-level listeners during
 * the drag catch every move regardless of what's under the cursor.
 */
export function DockResizer({ width, onWidthChange }: DockResizerProps) {
  const onWidthChangeRef = useRef(onWidthChange);
  onWidthChangeRef.current = onWidthChange;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";

    const onMove = (ev: PointerEvent) => {
      // Dragging left (clientX decreases) should grow the right-anchored dock.
      onWidthChangeRef.current(startWidth + (startX - ev.clientX));
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  };

  return (
    <div
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      // 6px-wide grab strip with a generous transparent hit area on each
      // side so the user doesn't have to be pixel-perfect.
      className="group relative z-20 h-full w-1.5 shrink-0 cursor-ew-resize bg-border/40 transition-colors hover:bg-primary/50 active:bg-primary/70"
    >
      <span className="absolute inset-y-0 -left-2 -right-2" />
    </div>
  );
}
