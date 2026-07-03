import React, { useMemo, useState } from 'react';
import { PulseData } from '../../pulseData';
import { CATEGORY_COLORS, fmt$k } from '../lib/format';

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Parse a ribbon month label (`"Feb 26"`) to a `year*12 + month` ordinal for
 *  comparison, or null if it doesn't match the `"MMM YY"` shape. */
const monthOrdinal = (label: string): number | null => {
  const [mon, yy] = label.split(' ');
  const mi = mon ? MONTH_ABBR.indexOf(mon) : -1;
  const year = yy ? Number(yy) : NaN;
  if (mi < 0 || !Number.isFinite(year)) return null;
  return (2000 + year) * 12 + mi;
};

/* -------------------------------------------------------------------- */
/*  CATEGORY RIBBON — used inside SpendingViewCard "timeline" view      */
/* -------------------------------------------------------------------- */
export const CategoryRibbon: React.FC<{ pulse: PulseData; width?: number }> = React.memo(
  ({ pulse, width = 1100 }) => {
    const cats = CATEGORY_COLORS;
    const labelW = 140;
    const cellW = (width - labelW) / pulse.months.length;
    const rowH = 40;

    // Position the TODAY marker at the real current date within the ribbon, not
    // at the last month with actuals (which lags whenever data entry is behind).
    // Seed the clock via a lazy useState so render stays pure (see app/CLAUDE.md).
    const [now] = useState(() => new Date());
    const markerIdx = useMemo(() => {
      const nowOrd = now.getFullYear() * 12 + now.getMonth();
      const ords = pulse.months.map((m) => monthOrdinal(m.m));
      const exact = ords.findIndex((o) => o === nowOrd);
      if (exact >= 0) {
        // offset into the cell by the fraction of the month already elapsed
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        return exact + (now.getDate() - 1) / daysInMonth;
      }
      const valid = ords.filter((o): o is number => o != null);
      if (valid.length > 0) {
        if (nowOrd < valid[0]!) return 0;
        if (nowOrd > valid[valid.length - 1]!) return pulse.months.length;
      }
      // unparseable labels / today out of an unknown range → old placement
      return pulse.lastActualIdx + 0.6;
    }, [now, pulse.months, pulse.lastActualIdx]);
    const maxBy: Record<string, number> = {};
    cats.forEach((c) => {
      maxBy[c.key] = Math.max(...pulse.months.map((m) => m[c.key] || 0), 1);
    });

    return (
      <div style={{ minWidth: width }}>
        <div className="flex mb-2" style={{ paddingLeft: labelW }}>
          {pulse.months.map((m, i) => (
            <div
              key={i}
              className="flex items-center justify-center text-[10px] text-[#737373] font-mono"
              style={{ width: cellW }}
            >
              {m.m.split(' ')[0]}
            </div>
          ))}
        </div>
        {cats.map((c) => (
          <div key={c.key} className="flex items-center mb-2">
            <div className="flex items-center gap-2" style={{ width: labelW }}>
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c.color }} />
              <span className="text-sm text-[#F4F6FF]">{c.label}</span>
            </div>
            {pulse.months.map((m, i) => {
              const v = m[c.key] || 0;
              const max = maxBy[c.key];
              const intensity = max ? v / max : 0;
              const active = v > 0;
              return (
                <div
                  key={i}
                  className="relative flex items-center justify-center"
                  style={{ width: cellW, height: rowH, padding: '0 2px' }}
                >
                  <div
                    className="w-full h-full rounded-md"
                    style={{
                      background: active
                        ? `color-mix(in oklab, ${c.color} ${Math.max(25, intensity * 100)}%, #0c0c0c)`
                        : 'rgba(255,255,255,0.02)',
                      border: active
                        ? `1px solid ${c.color}30`
                        : '1px solid rgba(255,255,255,0.04)',
                      opacity: m.actual ? 1 : 0.85,
                    }}
                  />
                  {active && intensity > 0.6 && (
                    <div
                      className="absolute inset-0 flex items-center justify-center text-[9px] font-mono font-semibold"
                      style={{ color: intensity > 0.7 ? '#080808' : '#F4F6FF' }}
                    >
                      {fmt$k(v)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        <div className="mt-4 flex items-center" style={{ paddingLeft: labelW }}>
          <div className="relative" style={{ width: cellW * pulse.months.length, height: 1 }}>
            <div
              className="absolute h-4 border-l-2 border-dashed border-[#F4F6FF]/40 -top-1"
              style={{ left: cellW * markerIdx }}
            />
            <div
              className="absolute -top-5 text-[10px] text-[#a3a3a3] font-mono"
              style={{ left: cellW * markerIdx - 18 }}
            >
              TODAY
            </div>
          </div>
        </div>
      </div>
    );
  },
);
CategoryRibbon.displayName = 'CategoryRibbon';
