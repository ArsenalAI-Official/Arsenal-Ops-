import { useCallback, useEffect, useRef, useState } from 'react';

// Drag-to-resize for the right-anchored ticket panel. Because the panel is
// pinned to the right edge, its width is `viewport − pointerX` while dragging
// the left-edge handle. Width is clamped to [min, max] (and never past the
// viewport) and persisted per-user in localStorage. Client-only SPA, so
// localStorage is the right store (mirrors useRailCollapsed / useNotepad).
interface UsePanelWidthOptions {
  storageKey: string;
  defaultWidth: number;
  min: number;
  max: number;
}

// Keyboard step for the resize separator (arrow keys), for a11y.
const KEY_STEP = 32;

export function usePanelWidth({ storageKey, defaultWidth, min, max }: UsePanelWidthOptions) {
  const [width, setWidth] = useState(defaultWidth);
  // Mirror of the latest width so the pointerup handler can persist without
  // re-subscribing on every change.
  const widthRef = useRef(defaultWidth);

  const clamp = useCallback(
    (n: number) => {
      // Guard against a stored/desired width larger than the current viewport.
      const viewportMax = typeof window !== 'undefined' ? window.innerWidth - 32 : max;
      return Math.min(Math.min(max, viewportMax), Math.max(min, n));
    },
    [min, max],
  );

  const apply = useCallback(
    (n: number) => {
      const c = clamp(n);
      widthRef.current = c;
      setWidth(c);
    },
    [clamp],
  );

  // Hydrate the persisted width on mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      const n = saved ? parseInt(saved, 10) : NaN;
      if (!Number.isNaN(n)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration of a persisted preference on mount (matches useRailCollapsed).
        apply(n);
      }
    } catch {
      /* storage unavailable — keep the default */
    }
  }, [storageKey, apply]);

  const persist = useCallback(() => {
    try {
      localStorage.setItem(storageKey, String(widthRef.current));
    } catch {
      /* ignore write failures */
    }
  }, [storageKey]);

  // Pointer-drag: track on window so the drag survives the cursor leaving the
  // thin handle. Disables text selection + sets a col-resize cursor globally
  // for the duration.
  const startResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const onMove = (ev: PointerEvent) => apply(window.innerWidth - ev.clientX);
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        persist();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
    },
    [apply, persist],
  );

  // Keyboard resize on the separator (Left/Right arrows).
  const onHandleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        apply(widthRef.current + KEY_STEP); // wider (left edge moves left)
        persist();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        apply(widthRef.current - KEY_STEP); // narrower
        persist();
      }
    },
    [apply, persist],
  );

  return { width, min, max, startResize, onHandleKeyDown };
}
