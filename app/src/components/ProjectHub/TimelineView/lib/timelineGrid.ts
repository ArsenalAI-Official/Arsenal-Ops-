import type { ZoomLevel } from '../types';

/** Add days to a date, returns new Date */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Format date as "Mar 15" */
export function fmtShort(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Format date as "March 2026" */
export function fmtMonth(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Get column width in px based on zoom level */
export function colWidth(zoom: ZoomLevel): number {
  if (zoom === 'day') return 40;
  if (zoom === 'week') return 120;
  return 160; // month
}

/** Get step in days for each column based on zoom */
export function colDays(zoom: ZoomLevel): number {
  if (zoom === 'day') return 1;
  if (zoom === 'week') return 7;
  return 30;
}

/** Number of columns to render on each side of the viewport for infinite scroll */
export const BUFFER_COLS = 30;
/** Row height in px */
export const ROW_HEIGHT = 44;
/** Left label width in px */
export const LABEL_WIDTH = 200;

export const getPriorityColor = (priority?: string) => {
  if (priority === 'high' || priority === 'critical') return 'border-[#EF4444]/50 text-[#EF4444]';
  if (priority === 'medium') return 'border-[#F59E0B]/50 text-[#F59E0B]';
  return 'border-[#737373]/50 text-[#737373]';
};
