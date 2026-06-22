import React, { useState } from 'react';
import { PulseData, FeatureForecastRow } from '../../pulseData';
import { Card } from '../components/Card';

/* -------------------------------------------------------------------- */
/*  FORECAST VS ACTUALS — Variant E bottom card (1:1 port)              */
/* -------------------------------------------------------------------- */
const ForecastVsActualsChart: React.FC<{ rows: FeatureForecastRow[]; width?: number }> = React.memo(
  ({ rows, width = 1100 }) => {
    const padL = 260,
      padR = 160,
      padT = 12,
      padB = 40;
    const rowH = 36;
    const H = rows.length * rowH;
    const total = H + padT + padB;
    const max = Math.max(...rows.map((r) => Math.max(r.fc, r.act)), 1);
    const yMax = Math.ceil(max / 20) * 20 || 20;
    const W = width - padL - padR;
    const xScale = (v: number) => (v / yMax) * W;
    const totalFC = rows.reduce((a, b) => a + b.fc, 0);
    const totalAct = rows.reduce((a, b) => a + b.act, 0);
    const ticks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax];

    return (
      <svg width={width} height={total + 40} style={{ display: 'block' }}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={padL + xScale(t)}
              x2={padL + xScale(t)}
              y1={padT}
              y2={padT + H}
              stroke="rgba(255,255,255,0.04)"
            />
            <text
              x={padL + xScale(t)}
              y={padT + H + 16}
              fill="#737373"
              fontSize="10"
              textAnchor="middle"
              fontFamily="ui-monospace, monospace"
            >
              {t}h
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y = padT + i * rowH + rowH / 2;
          const barH = 10;
          const variance = r.act - r.fc;
          const varPct = r.fc > 0 ? variance / r.fc : 0;
          const over = variance > 0;
          return (
            <g key={i}>
              {i > 0 && (
                <line
                  x1={0}
                  x2={width}
                  y1={padT + i * rowH}
                  y2={padT + i * rowH}
                  stroke="rgba(255,255,255,0.03)"
                />
              )}
              <text x={12} y={y - 2} fill="#F4F6FF" fontSize="12" fontWeight="500">
                {r.feature}
              </text>
              <text x={12} y={y + 12} fill="#737373" fontSize="10">
                {r.employee}
              </text>
              <rect
                x={padL}
                y={y - barH - 1}
                width={xScale(r.fc)}
                height={barH}
                fill="rgba(255,255,255,0.05)"
                stroke="#737373"
                strokeWidth="1"
                strokeDasharray="3 2"
              />
              <rect
                x={padL}
                y={y + 1}
                width={xScale(r.act)}
                height={barH}
                fill={over ? '#FBBF24' : '#34D399'}
                opacity="0.9"
              />
              <g transform={`translate(${padL + W + 12}, ${y - 6})`}>
                <rect
                  x={0}
                  y={0}
                  width={120}
                  height={20}
                  rx={4}
                  fill={over ? 'rgba(251,191,36,0.1)' : 'rgba(52,211,153,0.1)'}
                  stroke={over ? 'rgba(251,191,36,0.3)' : 'rgba(52,211,153,0.3)'}
                />
                <text
                  x={60}
                  y={13}
                  fill={over ? '#FBBF24' : '#34D399'}
                  fontSize="10"
                  textAnchor="middle"
                  fontFamily="ui-monospace, monospace"
                  fontWeight="600"
                >
                  {over ? '+' : ''}
                  {variance}h · {over ? '+' : ''}
                  {Math.round(varPct * 100)}%
                </text>
              </g>
            </g>
          );
        })}
        <g>
          <line x1={0} x2={width} y1={padT + H} y2={padT + H} stroke="rgba(255,255,255,0.1)" />
          <text x={12} y={padT + H + 34} fill="#F4F6FF" fontSize="13" fontWeight="600">
            Total
          </text>
          <text
            x={padL}
            y={padT + H + 34}
            fill="#a3a3a3"
            fontSize="11"
            fontFamily="ui-monospace, monospace"
          >
            Forecast {totalFC}h
          </text>
          <text
            x={padL + 120}
            y={padT + H + 34}
            fill={totalAct > totalFC ? '#FBBF24' : '#34D399'}
            fontSize="11"
            fontFamily="ui-monospace, monospace"
          >
            Actual {totalAct}h ({totalAct - totalFC >= 0 ? '+' : ''}
            {totalAct - totalFC}h)
          </text>
        </g>
      </svg>
    );
  },
);
ForecastVsActualsChart.displayName = 'ForecastVsActualsChart';

export const ForecastVsActualsCard: React.FC<{ pulse: PulseData }> = ({ pulse }) => {
  const [scope, setScope] = useState<'current' | 'last' | 'project'>('current');
  const SCOPES = [
    { id: 'current' as const, label: 'Current month', sub: `${pulse.summary.monthLabel} (MTD)` },
    { id: 'last' as const, label: 'Last month', sub: 'Previous period' },
    { id: 'project' as const, label: 'Entire project', sub: 'To date' },
  ];
  const rows = pulse.forecastVsActuals[scope];
  const activeScope = SCOPES.find((s) => s.id === scope)!;
  const totalFC = rows.reduce((a, b) => a + b.fc, 0);
  const totalAct = rows.reduce((a, b) => a + b.act, 0);
  const variance = totalAct - totalFC;
  const under = variance < 0;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">
            Forecasted vs Actuals · Dev hours by feature
          </h3>
          <p className="text-xs text-[#737373] mt-0.5">
            {activeScope.sub} · {rows.length} features ·{' '}
            {under ? `${Math.abs(variance)}h under forecast` : `${variance}h over forecast`}
          </p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-4 text-xs text-[#a3a3a3]">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-2 border border-dashed border-[#737373] bg-white/5" />
              Forecast
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-2 bg-[#34D399]" />
              Actual (under)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-2 bg-[#FBBF24]" />
              Actual (over)
            </span>
          </div>
          <div className="flex items-center p-0.5 rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)]">
            {SCOPES.map((s) => (
              <button
                key={s.id}
                onClick={() => setScope(s.id)}
                className={
                  'px-3 py-1.5 text-xs rounded-md transition-colors ' +
                  (scope === s.id
                    ? 'bg-[#E0B954]/15 text-[#E0B954] font-semibold'
                    : 'text-[#a3a3a3] hover:text-white')
                }
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        {rows.length === 0 ? (
          <div className="text-center py-12 text-xs text-[#737373]">No data for this period.</div>
        ) : (
          <ForecastVsActualsChart rows={rows} width={1100} />
        )}
      </div>
    </Card>
  );
};
