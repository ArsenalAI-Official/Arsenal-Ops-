export const fmt$ = (v: number) =>
  (v < 0 ? '-' : '') + '$' + Math.abs(Math.round(v)).toLocaleString();
export const fmt$k = (v: number) =>
  (v < 0 ? '-' : '') + '$' + Math.round(Math.abs(v) / 100) / 10 + 'k';
export const fmtPct = (v: number) => Math.round(v * 100) + '%';

export const CATEGORY_COLORS = [
  { key: 'dev', label: 'Development', color: '#E0B954' },
  { key: 'mgmt', label: 'Mgmt', color: '#5EEAD4' },
  { key: 'ba', label: 'BA / GTM Analyst', color: '#A78BFA' },
  { key: 'ad', label: 'Ad Spend', color: '#F87171' },
  { key: 'gtm', label: 'GTM', color: '#F472B6' },
] as const;
