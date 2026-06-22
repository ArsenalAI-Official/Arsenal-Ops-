import { useState, useCallback } from 'react';

interface UseBoardDndOptions {
  /**
   * Called when a card is dropped on a column to change its status. Injected
   * by the orchestrator (wired to the work-item move mutation's `mutate`) so
   * this hook stays react-query-agnostic and unit-testable.
   */
  onMove: (vars: { itemId: string; newStatus: string }) => void;
}

/**
 * Drag-and-drop state + handlers for the kanban board, extracted verbatim
 * from the orchestrator. The hook owns BOTH the state (`draggedItem`,
 * `dragOverColumn`) and the handlers together so the `handleDrop` closure
 * reads the current `draggedItem` without going stale (R3). The exact
 * `useCallback` dependency arrays from the originals are preserved.
 *
 * `onDrop` only changes STATUS (no sprint context) — same as before.
 */
export function useBoardDnd({ onMove }: UseBoardDndOptions) {
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // Drag and drop handlers — useCallback so they're stable across renders.
  // setState setters are stable, so deps stay empty.
  const onDragStart = useCallback((itemId: string) => {
    setDraggedItem(itemId);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent, status: string) => {
    e.preventDefault();
    setDragOverColumn(status);
  }, []);

  const onDragLeave = useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent, newStatus: string) => {
      e.preventDefault();
      setDragOverColumn(null);
      if (!draggedItem) return;
      onMove({ itemId: draggedItem, newStatus });
      setDraggedItem(null);
    },
    [draggedItem, onMove],
  );

  return { draggedItem, dragOverColumn, onDragStart, onDragOver, onDragLeave, onDrop };
}
