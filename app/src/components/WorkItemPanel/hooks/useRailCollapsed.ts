import { useEffect, useState } from 'react';

// Persist the Properties-rail collapsed state per-user in localStorage. This is
// a client-rendered Vite SPA (no SSR), so localStorage is the simpler fit than a
// cookie — mirrors the existing useNotepad hydration pattern. The header
// layout-toggle and the rail both consume this; the shell (PanelLayout) owns it.
const STORAGE_KEY = 'workItemPanel.railCollapsed';

export function useRailCollapsed() {
  const [collapsed, setCollapsed] = useState(false);

  // One-time hydration from localStorage on mount.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration of a persisted preference on mount (matches useNotepad).
      setCollapsed(localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      /* storage unavailable (private mode / SSR) — fall back to expanded */
    }
  }, []);

  const toggle = () =>
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore write failures */
      }
      return next;
    });

  return { collapsed, toggle };
}
