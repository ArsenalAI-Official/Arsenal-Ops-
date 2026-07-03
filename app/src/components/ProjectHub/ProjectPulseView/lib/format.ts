import { parseLocalDate } from '@/lib/dateUtils';

export const fmt$ = (v: number) =>
  (v < 0 ? '-' : '') + '$' + Math.abs(Math.round(v)).toLocaleString();

/** Format a Pulse date for display. Derived meta/milestone dates arrive from the
 *  backend as ISO (`2026-05-20T22:22:18…`); manual/localStorage values are
 *  already short labels like `"Feb 26"` or `"May 2026"`. Parse ISO → `"Mon YYYY"`
 *  and pass every non-ISO string through unchanged, so we never render a raw
 *  timestamp but also never mangle a hand-entered label. Empty → `''`. */
export const fmtPulseDate = (value: string | null | undefined): string => {
  if (!value) return '';
  const d = parseLocalDate(value);
  if (!d) return value;
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};
export const fmt$k = (v: number) =>
  (v < 0 ? '-' : '') + '$' + Math.round(Math.abs(v) / 100) / 10 + 'k';
export const fmtPct = (v: number) => Math.round(v * 100) + '%';

export const CATEGORY_COLORS = [
  { key: 'dev', label: 'Development', color: '#A6A29C' },
  { key: 'mgmt', label: 'Mgmt', color: '#5EEAD4' },
  { key: 'ba', label: 'BA / GTM Analyst', color: '#A78BFA' },
  { key: 'ad', label: 'Ad Spend', color: '#F87171' },
  { key: 'gtm', label: 'GTM', color: '#F472B6' },
] as const;
