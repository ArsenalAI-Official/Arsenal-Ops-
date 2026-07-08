import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

import { getStatusColor } from '@/lib/workItemConfig';

export interface StatusDonutDatum {
  /** Stable key for the slice (raw status/priority name). */
  name: string;
  /** Human label shown in the legend + tooltip. */
  label: string;
  value: number;
  /**
   * Slice color (literal hex — recharts can't read CSS vars). Optional: when
   * omitted it's resolved from the canonical `getStatusColor(name)` so work-item
   * status slices stay in lockstep with the board/timeline/calendar palette.
   */
  color?: string;
}

interface StatusDonutProps {
  data: StatusDonutDatum[];
  /** Caption under the center figure (which is always the sum of `value`s). */
  totalLabel?: string;
  /** Donut square size in px. */
  size?: number;
}

/**
 * Shared status donut: a ring with a center total and a legend of
 * count + percentage beside it. Extracted from the Admin dashboard's
 * "Tickets by Status" chart so the Project Tracker's "Status Distribution"
 * (audit J2) renders identically instead of a bare bottom-legend donut.
 */
export function StatusDonut({ data, totalLabel = 'Total', size = 180 }: StatusDonutProps) {
  const sum = data.reduce((acc, d) => acc + d.value, 0);
  return (
    <div className="flex items-center gap-5">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius={size * 0.31}
              outerRadius={size * 0.44}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color ?? getStatusColor(d.name)} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#121212',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                fontSize: 12,
                textTransform: 'capitalize',
              }}
              itemStyle={{ color: '#a3a3a3' }}
              wrapperStyle={{ outline: 'none', zIndex: 50 }}
              formatter={(value: number, name: string) => [
                sum > 0 ? `${value} (${Math.round((value / sum) * 100)}%)` : `${value}`,
                name,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-2xl font-bold text-white tabular-nums">{sum}</div>
          <div className="text-[10px] text-[#737373] uppercase tracking-wider">{totalLabel}</div>
        </div>
      </div>
      <ul className="flex-1 space-y-1.5 min-w-0">
        {data.map((d) => {
          const pct = sum > 0 ? Math.round((d.value / sum) * 100) : 0;
          return (
            <li key={d.name} className="flex items-center gap-2 text-xs">
              <span
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: d.color ?? getStatusColor(d.name) }}
              />
              <span className="text-[#a3a3a3] capitalize truncate">{d.label}</span>
              <span className="ml-auto text-[#737373] tabular-nums">{d.value}</span>
              <span className="text-[#525252] tabular-nums w-9 text-right">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
