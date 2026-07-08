import { useCallback, useRef, useState } from 'react';

// Drag-to-move for a floating ticket window. The window is `position: fixed` at
// {x, y}; dragging the header translates it, clamped so a strip always stays
// on-screen (can't be lost past the viewport edges). Pointer events are tracked
// on `window` so the drag survives the cursor leaving the header.
export function useFloatingPosition(initial: { x: number; y: number }) {
  const [pos, setPos] = useState(initial);
  const posRef = useRef(initial);

  const set = useCallback((p: { x: number; y: number }) => {
    posRef.current = p;
    setPos(p);
  }, []);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      // Don't start a drag from an interactive control in the header.
      if ((e.target as HTMLElement).closest('button, a, input, select, [role="separator"]')) {
        return;
      }
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const origin = { ...posRef.current };
      const onMove = (ev: PointerEvent) => {
        const x = Math.min(Math.max(0, origin.x + ev.clientX - startX), window.innerWidth - 200);
        const y = Math.min(Math.max(0, origin.y + ev.clientY - startY), window.innerHeight - 80);
        set({ x, y });
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.userSelect = '';
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      document.body.style.userSelect = 'none';
    },
    [set],
  );

  return { pos, startDrag };
}
