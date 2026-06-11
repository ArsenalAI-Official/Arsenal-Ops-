/** Format an ISO timestamp as "Nm ago" / "Nh ago" / "Nd ago" against a
 *  caller-provided `now`. Falls back to a locale date string for anything
 *  older than 6 days. Pure — safe to call in render. */
export const formatRelative = (iso: string, now: number): string => {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const diff = Math.max(0, now - then);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
};
