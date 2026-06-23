import React, { useMemo } from 'react';
import { PulseData, computeDerived } from '../../pulseData';
import { CATEGORY_COLORS, fmt$k } from '../lib/format';

/* -------------------------------------------------------------------- */
/*  STACKED BURN CHART — used inside SpendingViewCard "chart" view      */
/* -------------------------------------------------------------------- */
export const BurnChart: React.FC<{ pulse: PulseData; width?: number; height?: number }> =
  React.memo(({ pulse, width = 1100, height = 340 }) => {
    const { monthsWithCum } = useMemo(() => computeDerived(pulse), [pulse]);
    const padL = 56,
      padR = 56,
      padT = 24,
      padB = 44;
    const W = width - padL - padR;
    const H = height - padT - padB;

    const maxStack = Math.max(...monthsWithCum.map((m) => m.total), 1);
    const maxCum = monthsWithCum[monthsWithCum.length - 1]?.cum || 1;
    const yMaxBar = Math.ceil(maxStack / 10000) * 10000 || 10000;
    const yMaxCum = Math.ceil(maxCum / 50000) * 50000 || 50000;

    const bw = W / monthsWithCum.length;
    const barW = bw * 0.62;
    const xBar = (i: number) => padL + bw * i + bw / 2 - barW / 2;
    const yBar = (v: number) => padT + H - (v / yMaxBar) * H;
    const yLine = (v: number) => padT + H - (v / yMaxCum) * H;

    const linePts = monthsWithCum.map(
      (m, i) => [padL + bw * i + bw / 2, yLine(m.cum)] as [number, number],
    );
    const actPath = linePts
      .slice(0, pulse.lastActualIdx + 1)
      .map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ' ' + p[1])
      .join(' ');
    const fcPath = linePts
      .slice(pulse.lastActualIdx)
      .map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ' ' + p[1])
      .join(' ');
    const barTicks = [0, yMaxBar * 0.25, yMaxBar * 0.5, yMaxBar * 0.75, yMaxBar];
    const cumTicks = [0, yMaxCum * 0.25, yMaxCum * 0.5, yMaxCum * 0.75, yMaxCum];
    const todayX = padL + bw * pulse.lastActualIdx + bw / 2 + bw * 0.35;

    return (
      <svg width={width} height={height} style={{ display: 'block' }}>
        <defs>
          <pattern
            id="hatch"
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="5" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
          </pattern>
        </defs>
        {barTicks.map((t, i) => (
          <line
            key={i}
            x1={padL}
            x2={padL + W}
            y1={yBar(t)}
            y2={yBar(t)}
            stroke="rgba(255,255,255,0.04)"
          />
        ))}
        {barTicks.map((t, i) => (
          <text
            key={i}
            x={padL - 8}
            y={yBar(t) + 4}
            fill="#737373"
            fontSize="10"
            textAnchor="end"
            fontFamily="ui-monospace, monospace"
          >
            {t === 0 ? '$0' : fmt$k(t)}
          </text>
        ))}
        {cumTicks.map((t, i) => (
          <text
            key={i}
            x={padL + W + 8}
            y={yLine(t) + 4}
            fill="#a3a3a3"
            fontSize="10"
            textAnchor="start"
            fontFamily="ui-monospace, monospace"
          >
            {t === 0 ? '$0' : fmt$k(t)}
          </text>
        ))}
        <text
          x={padL}
          y={padT - 8}
          fill="#737373"
          fontSize="10"
          fontFamily="ui-monospace, monospace"
        >
          Monthly burn
        </text>
        <text
          x={padL + W}
          y={padT - 8}
          fill="#a3a3a3"
          fontSize="10"
          textAnchor="end"
          fontFamily="ui-monospace, monospace"
        >
          Cumulative
        </text>
        <g>
          <line
            x1={todayX}
            x2={todayX}
            y1={padT}
            y2={padT + H}
            stroke="#F4F6FF"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.4"
          />
          <rect
            x={todayX - 22}
            y={padT - 6}
            width="44"
            height="16"
            rx="4"
            fill="#1a1a1a"
            stroke="rgba(255,255,255,0.15)"
          />
          <text
            x={todayX}
            y={padT + 5}
            fill="#F4F6FF"
            fontSize="9"
            textAnchor="middle"
            fontFamily="ui-monospace, monospace"
          >
            TODAY
          </text>
        </g>
        {monthsWithCum.map((m, i) => {
          let acc = 0;
          return (
            <g key={i}>
              {CATEGORY_COLORS.map((s) => {
                const v = m[s.key] || 0;
                if (!v) return null;
                const h = (v / yMaxBar) * H;
                const y = yBar(acc) - h;
                acc += v;
                return (
                  <rect
                    key={s.key}
                    x={xBar(i)}
                    y={y}
                    width={barW}
                    height={h}
                    fill={s.color}
                    opacity={m.actual ? 1 : 0.45}
                  />
                );
              })}
              {!m.actual && (
                <rect
                  x={xBar(i)}
                  y={yBar(m.total)}
                  width={barW}
                  height={H - (yBar(m.total) - padT)}
                  fill="url(#hatch)"
                  pointerEvents="none"
                />
              )}
              <text
                x={xBar(i) + barW / 2}
                y={padT + H + 16}
                fill="#a3a3a3"
                fontSize="10"
                textAnchor="middle"
                fontFamily="ui-monospace, monospace"
              >
                {m.m}
              </text>
            </g>
          );
        })}
        <path d={actPath} fill="none" stroke="#F4F6FF" strokeWidth="2.25" strokeLinecap="round" />
        <path
          d={fcPath}
          fill="none"
          stroke="#F4F6FF"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeDasharray="5 4"
          opacity="0.65"
        />
        {linePts.map((p, i) => (
          <circle
            key={i}
            cx={p[0]}
            cy={p[1]}
            r={i <= pulse.lastActualIdx ? 3.5 : 2.5}
            fill="#F4F6FF"
            stroke="#080808"
            strokeWidth="2"
          />
        ))}
      </svg>
    );
  });
BurnChart.displayName = 'BurnChart';
