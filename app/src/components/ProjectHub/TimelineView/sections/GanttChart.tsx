import React from 'react';
import { CardContent } from '@/components/ui/card';
import { getStatusColor } from '@/lib/workItemConfig';
import { parseLocalDate } from '@/lib/dateUtils';
import { addDays, colDays, fmtShort, LABEL_WIDTH, ROW_HEIGHT } from '../lib/timelineGrid';
import type { GanttRow, WorkItem, ZoomLevel } from '../types';
import type { SprintResponse } from '@/client';

interface GanttChartProps {
  rows: GanttRow[];
  columns: Date[];
  monthGroups: { label: string; x: number; width: number }[];
  cw: number;
  totalWidth: number;
  zoom: ZoomLevel;
  today: Date;
  todayX: number;
  dateToX: (date: Date) => number;
  headerHeight: number;
  chartHeight: number;
  sprints: SprintResponse[];
  workItems: WorkItem[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onSelectItem: (item: WorkItem) => void;
}

const GanttChart: React.FC<GanttChartProps> = ({
  rows,
  columns,
  monthGroups,
  cw,
  totalWidth,
  zoom,
  today,
  todayX,
  dateToX,
  headerHeight,
  chartHeight,
  sprints,
  workItems,
  scrollRef,
  onSelectItem,
}) => {
  return (
    <CardContent className="p-0">
      <div className="flex" style={{ height: headerHeight + chartHeight }}>
        {/* Left labels panel */}
        <div
          className="flex-shrink-0 bg-[#0d0d0d] border-r border-[rgba(255,255,255,0.08)] z-10"
          style={{ width: LABEL_WIDTH }}
        >
          {/* Header spacer */}
          <div
            style={{ height: headerHeight }}
            className="border-b border-[rgba(255,255,255,0.08)]"
          />
          {/* Row labels */}
          {rows.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[#737373] text-sm px-4 text-center">
              No tasks with dates.
              <br />
              Add dates to see the timeline.
            </div>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className="flex items-center px-3 text-sm truncate cursor-pointer hover:bg-[#121212] transition-colors"
                style={{ height: ROW_HEIGHT, borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                onClick={() => {
                  if (row.type === 'task') {
                    const item = workItems.find((w) => w.id === row.id);
                    if (item) {
                      onSelectItem(item);
                    }
                  }
                }}
                title={row.label}
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0 mr-2"
                  style={{ backgroundColor: row.color }}
                />
                <span className="text-[#d4d4d4] truncate text-xs">{row.label}</span>
              </div>
            ))
          )}
        </div>

        {/* Scrollable gantt area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative"
          style={{ scrollBehavior: 'smooth' }}
        >
          <div style={{ width: totalWidth, position: 'relative' }}>
            {/* Header: month row + date/week row */}
            <div
              className="sticky top-0 z-20 bg-[#0d0d0d] border-b border-[rgba(255,255,255,0.08)]"
              style={{ height: headerHeight }}
            >
              {/* Month labels */}
              <div
                style={{
                  height: 24,
                  position: 'relative',
                  borderBottom: '1px solid rgba(244,246,255,0.05)',
                }}
              >
                {monthGroups.map((g, i) => (
                  <div
                    key={i}
                    className="absolute top-0 text-xs font-semibold text-white px-2 flex items-center overflow-hidden"
                    style={{ left: g.x, width: g.width, height: 24 }}
                  >
                    {g.label}
                  </div>
                ))}
              </div>
              {/* Date/Week labels */}
              <div style={{ height: 32, position: 'relative' }}>
                {columns.map((date, i) => {
                  const isToday = date.toDateString() === today.toDateString();
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  return (
                    <div
                      key={i}
                      className={`absolute top-0 flex items-center justify-center text-xs border-r border-[rgba(255,255,255,0.03)] ${isToday ? 'text-indigo-400 font-bold' : isWeekend ? 'text-[#4B5563]' : 'text-[#a3a3a3]'}`}
                      style={{ left: i * cw, width: cw, height: 32 }}
                    >
                      {zoom === 'day'
                        ? date.getDate()
                        : zoom === 'week'
                          ? fmtShort(date)
                          : date.toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Grid + bars */}
            <div style={{ height: chartHeight, position: 'relative' }}>
              {/* Vertical grid lines */}
              {columns.map((date, i) => {
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                return (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      left: i * cw,
                      top: 0,
                      width: cw,
                      height: chartHeight,
                      backgroundColor: isWeekend ? 'rgba(255,255,255,0.012)' : 'transparent',
                      borderRight: '1px solid rgba(255,255,255,0.03)',
                    }}
                  />
                );
              })}

              {/* Sprint bands */}
              {sprints
                .filter((s) => s.start_date && s.end_date)
                .map((sprint) => {
                  const bandStart = parseLocalDate(sprint.start_date!)!;
                  const bandEnd = parseLocalDate(sprint.end_date!)!;
                  const x1 = dateToX(bandStart);
                  const x2 = dateToX(addDays(bandEnd, 1));
                  const bandWidth = x2 - x1;
                  if (bandWidth <= 0) return null;
                  const isActive = sprint.status === 'active';
                  const isCompleted = sprint.status === 'completed';
                  const bg = isActive
                    ? 'rgba(224,185,84,0.06)'
                    : isCompleted
                      ? 'rgba(115,115,115,0.04)'
                      : 'rgba(115,115,115,0.06)';
                  const borderCol = isActive
                    ? 'rgba(224,185,84,0.3)'
                    : isCompleted
                      ? 'rgba(115,115,115,0.15)'
                      : 'rgba(115,115,115,0.2)';
                  const labelCol = isActive ? 'rgba(224,185,84,0.75)' : 'rgba(115,115,115,0.55)';
                  return (
                    <div
                      key={sprint.id}
                      style={{
                        position: 'absolute',
                        left: x1,
                        top: 0,
                        width: bandWidth,
                        height: chartHeight,
                        backgroundColor: bg,
                        borderLeft: `2px solid ${borderCol}`,
                        borderRight: `1px solid ${borderCol}`,
                        pointerEvents: 'none',
                      }}
                    >
                      {bandWidth > 50 && (
                        <span
                          style={{
                            position: 'absolute',
                            top: 5,
                            left: 6,
                            fontSize: 10,
                            fontWeight: 600,
                            color: labelCol,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: bandWidth - 12,
                            letterSpacing: '0.02em',
                          }}
                        >
                          {sprint.name}
                        </span>
                      )}
                    </div>
                  );
                })}

              {/* Today highlight */}
              {todayX >= 0 && todayX <= totalWidth && (
                <div
                  style={{
                    position: 'absolute',
                    left: todayX,
                    top: 0,
                    width: cw,
                    height: chartHeight,
                    backgroundColor: 'rgba(224,185,84,0.08)',
                    borderLeft: '2px solid rgba(224,185,84,0.6)',
                    pointerEvents: 'none',
                  }}
                />
              )}

              {/* Horizontal row lines */}
              {rows.map((_, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: i * ROW_HEIGHT,
                    width: totalWidth,
                    height: ROW_HEIGHT,
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                  }}
                />
              ))}

              {/* Task bars */}
              {rows.map((row, i) => {
                const x1 = dateToX(row.start);
                // For milestones/goals (same start=end), show diamond; add 1 colDays width minimum
                const isMilestone = row.type !== 'task';
                const endDate = isMilestone ? addDays(row.end, colDays(zoom)) : addDays(row.end, 1);
                const x2 = dateToX(endDate);
                const barWidth = Math.max(isMilestone ? cw * 0.6 : 4, x2 - x1);
                const barTop = i * ROW_HEIGHT + 8;
                const barHeight = ROW_HEIGHT - 16;

                return (
                  <div
                    key={row.id}
                    style={{
                      position: 'absolute',
                      left: x1,
                      top: barTop,
                      width: barWidth,
                      height: barHeight,
                      backgroundColor: row.color,
                      borderRadius: isMilestone ? '50%' : 4,
                      opacity: 0.9,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      overflow: 'hidden',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }}
                    onClick={() => {
                      if (row.type === 'task') {
                        const item = workItems.find((w) => w.id === row.id);
                        if (item) {
                          onSelectItem(item);
                        }
                      }
                    }}
                    title={`${row.label}\n${fmtShort(row.start)} → ${fmtShort(row.end)}`}
                  >
                    {/* Progress fill */}
                    {row.progress > 0 && (
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          width: `${row.progress}%`,
                          height: '100%',
                          backgroundColor: 'rgba(255,255,255,0.15)',
                          borderRadius: 4,
                        }}
                      />
                    )}
                    {/* Label inside bar */}
                    {barWidth > 60 && (
                      <span
                        style={{
                          fontSize: 10,
                          color: 'white',
                          paddingLeft: 6,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          position: 'relative',
                          zIndex: 1,
                        }}
                      >
                        {row.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-3 border-t border-[rgba(255,255,255,0.05)] text-xs flex-wrap">
        {[
          { color: getStatusColor('done'), label: 'Done' },
          { color: getStatusColor('in_progress'), label: 'In Progress' },
          { color: getStatusColor('in_review'), label: 'In Review' },
          { color: getStatusColor('todo'), label: 'To Do' },
          { color: '#EF4444', label: 'Overdue' },
          { color: '#EC4899', label: 'Milestone' },
          { color: '#F59E0B', label: 'Goal' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
            <span className="text-[#737373]">{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div
            className="w-3 h-3 rounded border-l-2"
            style={{
              backgroundColor: 'rgba(224,185,84,0.06)',
              borderColor: 'rgba(224,185,84,0.3)',
            }}
          />
          <span className="text-[#737373]">Sprint</span>
        </div>
      </div>
    </CardContent>
  );
};

export default GanttChart;
