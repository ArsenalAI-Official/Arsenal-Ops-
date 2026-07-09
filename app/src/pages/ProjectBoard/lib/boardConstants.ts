// Canonical kanban-column order for the board view. Matches the key order of
// the component's STATUS_CONFIG object (the board currently iterates
// `Object.keys(STATUS_CONFIG)`); extracted here so the forthcoming BoardView
// component (and any other consumer) can share a single source of truth.
export const BOARD_STATUS_ORDER = ['backlog', 'todo', 'in_progress', 'in_review', 'done'] as const;

// Page size for the Done column's "Show older" footer (GET /board/done-archive).
// The backend caps `limit` at 100; the server-side visibility cutoff itself
// (30 days) lives in backend/routers/workitems.py as BOARD_DONE_MAX_AGE_DAYS.
export const DONE_ARCHIVE_PAGE_SIZE = 25;
