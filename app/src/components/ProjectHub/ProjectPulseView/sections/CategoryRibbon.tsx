import React from 'react';
import { PulseData } from '../../pulseData';
import { CATEGORY_COLORS, fmt$k } from '../lib/format';

/* -------------------------------------------------------------------- */
/*  CATEGORY RIBBON — used inside SpendingViewCard "timeline" view      */
/* -------------------------------------------------------------------- */
export const CategoryRibbon: React.FC<{ pulse: PulseData; width?: number }> = React.memo(
  ({ pulse, width = 1100 }) => {
    const cats = CATEGORY_COLORS;
    const labelW = 140;
    const cellW = (width - labelW) / pulse.months.length;
    const rowH = 40;
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
              style={{ left: cellW * (pulse.lastActualIdx + 0.6) }}
            />
            <div
              className="absolute -top-5 text-[10px] text-[#a3a3a3] font-mono"
              style={{ left: cellW * (pulse.lastActualIdx + 0.6) - 18 }}
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
