/**
 * Render an ISO datetime string as a human-friendly relative time.
 *
 *   just now / 12m ago / 3h ago / 5d ago
 *
 * Beyond a week, falls back to a locale date string so old events still
 * have an absolute reference instead of "57d ago".
 *
 * Used in both ticket-side-panel comment feeds and the project Activity
 * tab so timestamps render identically across the app.
 */
export function formatTimeAgo(dateString: string | null | undefined): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
