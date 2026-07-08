import { useCallback, useRef, useState } from 'react';

// Corner-drag resize for a floating ticket window. The window is positioned by
// its top-left {x,y}, so resizing from the bottom-right corner is a simple
// delta: new size = start size + pointer delta, clamped to a min and to the
// viewport. Delta-based (not pointer-absolute) so it's independent of position.
const MIN_W = 440;
const MIN_H = 320;

export function useFloatingSize(initialWidth: number, initialHeight: number) {
  const [size, setSize] = useState({ w: initialWidth, h: initialHeight });
  const ref = useRef({ w: initialWidth, h: initialHeight });

  const set = useCallback((s: { w: number; h: number }) => {
    ref.current = s;
    setSize(s);
  }, []);

  const startResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const origin = { ...ref.current };
      const onMove = (ev: PointerEvent) =>
        set({
          w: Math.min(Math.max(MIN_W, origin.w + ev.clientX - startX), window.innerWidth - 24),
          h: Math.min(Math.max(MIN_H, origin.h + ev.clientY - startY), window.innerHeight - 24),
        });
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'nwse-resize';
    },
    [set],
  );

  return { size, startResize };
}
