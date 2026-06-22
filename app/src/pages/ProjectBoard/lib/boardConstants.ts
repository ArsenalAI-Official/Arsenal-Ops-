// Canonical kanban-column order for the board view. Matches the key order of
// the component's STATUS_CONFIG object (the board currently iterates
// `Object.keys(STATUS_CONFIG)`); extracted here so the forthcoming BoardView
// component (and any other consumer) can share a single source of truth.
export const BOARD_STATUS_ORDER = ['backlog', 'todo', 'in_progress', 'in_review', 'done'] as const;
