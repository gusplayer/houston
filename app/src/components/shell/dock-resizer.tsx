import { useCallback, useEffect, useRef } from "react";

interface DockResizerProps {
  /** Current dock width in px. */
  width: number;
  /** Setter called continuously while dragging. Should clamp internally. */
  onWidthChange: (next: number) => void;
}

/**
 * Vertical drag handle that sits on the LEFT edge of the right-side dock
 * and resizes its width by pointer drag. The dock grows as the cursor
 * moves left (the dock is anchored to the right side of the main area).
 *
 * Pointer events instead of mouse so it works with trackpads, pens, and
 * touch. We capture the pointer for the duration of the drag so the
 * cursor stays as `ew-resize` even if the user drags fast and leaves the
 * 4px handle.
 */
export function DockResizer({ width, onWidthChange }: DockResizerProps) {
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const draggingRef = useRef(false);
  const handleRef = useRef<HTMLDivElement | null>(null);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!draggingRef.current) return;
      // Dock is on the right; dragging left should grow it.
      const delta = startXRef.current - e.clientX;
      onWidthChange(startWidthRef.current + delta);
    },
    [onWidthChange],
  );

  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      handleRef.current?.releasePointerCapture?.(e.pointerId);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    },
    [],
  );

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    handleRef.current?.setPointerCapture?.(e.pointerId);
    // Prevent text selection and force a consistent resize cursor for the
    // duration of the drag, since the cursor leaves the 4-px hit area.
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
  };

  return (
    <div
      ref={handleRef}
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      className="group relative z-10 h-full w-1 shrink-0 cursor-ew-resize bg-border/30 transition-colors hover:bg-primary/40 active:bg-primary/60"
    >
      {/* Wider invisible hit area for easier grabbing */}
      <span className="absolute inset-y-0 -left-1.5 -right-1.5" />
    </div>
  );
}
