import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { isPastDue } from '@/components/ProjectsPage/utils';
import { Card } from '@/components/ui/card';
import { parseLocalDate } from '@/lib/dateUtils';
import { getStatusColor } from '@/lib/workItemConfig';
import { addDays, colDays, colWidth, fmtMonth, BUFFER_COLS, ROW_HEIGHT } from './lib/timelineGrid';
import GanttChart from './sections/GanttChart';
import TicketDetailPanel from './sections/TicketDetailPanel';
import TimelineToolbar from './sections/TimelineToolbar';
import type { GanttRow, TimelineViewProps, WorkItem, ZoomLevel } from './types';

const TimelineView: React.FC<TimelineViewProps> = ({
  workItems,
  milestones = [],
  goals = [],
  sprints = [],
  projectStartDate: _projectStartDate,
  projectId: _projectId,
  onTaskClick,
  onTaskUpdate: _onTaskUpdate,
}) => {
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);
  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const [viewStart, setViewStart] = useState<Date>(() => {
    // Start view at today minus 2 columns so there's context
    const d = new Date();
    d.setDate(d.getDate() - colDays('week') * 2);
    return d;
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  // Build rows from workItems, milestones, goals
  const rows: GanttRow[] = useMemo(() => {
    const taskRows: GanttRow[] = workItems
      .filter((item) => item.start_date || item.due_date)
      .map((item) => {
        const start = parseLocalDate((item.start_date || item.due_date)!)!;
        const end = parseLocalDate((item.due_date || item.start_date)!)!;
        const isOverdue = isPastDue(item.due_date, item.status);
        const color = isOverdue ? '#EF4444' : getStatusColor(item.status);
        return {
          id: item.id,
          label: `${item.key}: ${item.title}`,
          start,
          end: end < start ? start : end,
          color,
          type: 'task' as const,
          progress: item.status === 'done' ? 100 : item.status === 'in_progress' ? 50 : 0,
        };
      });

    const milestoneRows: GanttRow[] = milestones
      .filter((m) => m.due_date)
      .map((m) => {
        const due = parseLocalDate(m.due_date!)!;
        return {
          id: `milestone-${m.id}`,
          label: `🎯 ${m.title}`,
          start: due,
          end: due,
          color: m.completed_at ? '#E0B954' : '#EC4899',
          type: 'milestone' as const,
          progress: m.completed_at ? 100 : 0,
        };
      });

    const goalRows: GanttRow[] = goals
      .filter((g) => g.due_date)
      .map((g) => {
        const due = parseLocalDate(g.due_date!)!;
        return {
          id: `goal-${g.id}`,
          label: `⭐ ${g.title}`,
          start: due,
          end: due,
          color: g.status === 'completed' ? '#E0B954' : '#F59E0B',
          type: 'goal' as const,
          progress: g.status === 'completed' ? 100 : g.progress || 0,
        };
      });

    return [...taskRows, ...milestoneRows, ...goalRows];
  }, [workItems, milestones, goals]);

  // Total visible columns = viewport width / colWidth, plus buffer on both sides
  const TOTAL_COLS = BUFFER_COLS * 2 + 60; // render 60 cols visible + buffer

  // Column headers: each column = one colDays(zoom) unit starting from viewStart - BUFFER_COLS*colDays
  const gridStart = useMemo(
    () => addDays(viewStart, -BUFFER_COLS * colDays(zoom)),
    [viewStart, zoom],
  );

  const columns = useMemo(() => {
    return Array.from({ length: TOTAL_COLS }, (_, i) => {
      const date = addDays(gridStart, i * colDays(zoom));
      return date;
    });
  }, [gridStart, zoom, TOTAL_COLS]);

  const cw = colWidth(zoom);
  const totalWidth = TOTAL_COLS * cw;

  // Convert a date to X pixel offset within the grid
  const dateToX = useCallback(
    (date: Date): number => {
      const diffMs = date.getTime() - gridStart.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      return (diffDays / colDays(zoom)) * cw;
    },
    [gridStart, zoom, cw],
  );

  // Scroll to viewStart on mount and when viewStart/zoom changes
  useEffect(() => {
    if (!scrollRef.current) return;
    // Scroll so that viewStart is at the left edge
    const x = BUFFER_COLS * cw;
    scrollRef.current.scrollLeft = x;
  }, [viewStart, zoom, cw]);

  // Navigate: move viewStart forward/backward
  const navigateBy = (direction: 1 | -1) => {
    const step = colDays(zoom) * 4; // move 4 columns at a time
    setViewStart((prev) => addDays(prev, direction * step));
  };

  const goToToday = () => {
    const d = new Date();
    d.setDate(d.getDate() - colDays(zoom) * 2);
    setViewStart(d);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayX = dateToX(today);

  // Month label groups for header top row
  const monthGroups = useMemo(() => {
    const groups: { label: string; x: number; width: number }[] = [];
    let currentMonth = '';
    let groupStart = 0;
    columns.forEach((date, i) => {
      const label = fmtMonth(date);
      if (label !== currentMonth) {
        if (currentMonth) {
          groups.push({ label: currentMonth, x: groupStart, width: i * cw - groupStart });
        }
        currentMonth = label;
        groupStart = i * cw;
      }
    });
    if (currentMonth) {
      groups.push({ label: currentMonth, x: groupStart, width: totalWidth - groupStart });
    }
    return groups;
  }, [columns, cw, totalWidth]);

  const headerHeight = 56; // px for 2-row header
  const chartHeight = Math.max(rows.length * ROW_HEIGHT + 20, 200);

  const handleSelectItem = (item: WorkItem) => {
    setSelectedItem(item);
    onTaskClick?.(item);
  };

  return (
    <>
      <Card className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
        <TimelineToolbar
          zoom={zoom}
          onNavigate={navigateBy}
          onGoToToday={goToToday}
          onSetZoom={setZoom}
        />
        <GanttChart
          rows={rows}
          columns={columns}
          monthGroups={monthGroups}
          cw={cw}
          totalWidth={totalWidth}
          zoom={zoom}
          today={today}
          todayX={todayX}
          dateToX={dateToX}
          headerHeight={headerHeight}
          chartHeight={chartHeight}
          sprints={sprints}
          workItems={workItems}
          scrollRef={scrollRef}
          onSelectItem={handleSelectItem}
        />
      </Card>

      {/* Ticket Detail Slide-in Panel */}
      {selectedItem && (
        <TicketDetailPanel selectedItem={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </>
  );
};

export default TimelineView;
