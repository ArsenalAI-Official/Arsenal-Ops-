import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import React, { useState, useMemo } from 'react';
import { Calendar, Views, dateFnsLocalizer, Navigate } from 'react-big-calendar';
import type { View, ToolbarProps } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import type { GoalResponse, MilestoneResponse } from '@/client';
import { isPastDue } from '@/components/ProjectsPage/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { parseLocalDate } from '@/lib/dateUtils';
import { getStatusColor } from '@/lib/workItemConfig';

interface WorkItem {
  id: string;
  key: string;
  title: string;
  status: string;
  priority: string;
  due_date?: string;
  start_date?: string;
  assignee?: string;
}

interface CalendarViewProps {
  workItems: WorkItem[];
  milestones?: MilestoneResponse[];
  goals?: GoalResponse[];
  onTaskClick?: (item: WorkItem) => void;
  onMilestoneClick?: (milestone: MilestoneResponse) => void;
}

// What each calendar event was built from. Discriminated on `type` so the
// click + style handlers can narrow: only `task` resources are full WorkItems.
type CalendarResource =
  | (WorkItem & { type: 'task' })
  | (MilestoneResponse & { type: 'milestone' })
  | (GoalResponse & { type: 'goal' });

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  resource: CalendarResource;
}

const locales = {
  'en-US': enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

const CalendarView: React.FC<CalendarViewProps> = ({
  workItems,
  milestones = [],
  goals = [],
  onTaskClick,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<View>(Views.MONTH);

  const events: CalendarEvent[] = useMemo(() => {
    const taskEvents: CalendarEvent[] = workItems
      .filter((item) => item.due_date || item.start_date)
      .map((item) => {
        const startDate = parseLocalDate((item.start_date || item.due_date)!)!;
        const dueDate = parseLocalDate((item.due_date || item.start_date)!)!;
        const effectiveEnd = dueDate < startDate ? startDate : dueDate;
        // react-big-calendar allDay end is exclusive:
        // to display an event THROUGH March 30, end must be March 31.
        const endExclusive = new Date(effectiveEnd);
        endExclusive.setDate(endExclusive.getDate() + 1);
        return {
          id: item.id,
          title: `${item.key}: ${item.title}`,
          start: startDate,
          end: endExclusive,
          allDay: true,
          resource: { ...item, type: 'task' },
        };
      });

    const milestoneEvents: CalendarEvent[] = milestones
      .filter((m) => m.due_date)
      .map((m) => {
        const dueDate = parseLocalDate(m.due_date!)!;
        const endExclusive = new Date(dueDate);
        endExclusive.setDate(endExclusive.getDate() + 1);
        return {
          id: `milestone-${m.id}`,
          title: `🎯 ${m.title}`,
          start: dueDate,
          end: endExclusive,
          allDay: true,
          resource: { ...m, type: 'milestone' },
        };
      });

    const goalEvents: CalendarEvent[] = goals
      .filter((g) => g.due_date)
      .map((g) => {
        const dueDate = parseLocalDate(g.due_date!)!;
        const endExclusive = new Date(dueDate);
        endExclusive.setDate(endExclusive.getDate() + 1);
        return {
          id: `goal-${g.id}`,
          title: `⭐ ${g.title}`,
          start: dueDate,
          end: endExclusive,
          allDay: true,
          resource: { ...g, type: 'goal' },
        };
      });

    return [...taskEvents, ...milestoneEvents, ...goalEvents];
  }, [workItems, milestones, goals]);

  const handleNavigate = (newDate: Date) => {
    setCurrentDate(newDate);
  };

  const handleSelectEvent = (event: CalendarEvent) => {
    // Only task resources are WorkItems; milestone/goal events don't open a task.
    if (onTaskClick && event.resource.type === 'task') {
      onTaskClick(event.resource);
    }
  };

  const eventStyleGetter = (event: CalendarEvent) => {
    const item = event.resource;
    // Only task resources carry a status; milestones/goals fall back to ''.
    const status = item.type === 'task' ? item.status : '';
    let backgroundColor = getStatusColor(status);

    // Check if overdue (canonical date-only semantics: due-today is not overdue)
    const isOverdue = isPastDue(item.due_date, status);
    if (isOverdue) {
      backgroundColor = '#EF4444';
    }

    return {
      style: {
        backgroundColor,
        borderRadius: '4px',
        opacity: 0.9,
        color: 'white',
        border: 'none',
        display: 'block',
        fontSize: '12px',
        padding: '2px 6px',
      },
    };
  };

  const CustomToolbar = ({
    onNavigate,
    label,
  }: Pick<ToolbarProps<CalendarEvent>, 'onNavigate' | 'label'>) => (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <button
          className="px-3 py-1.5 rounded-md border border-gray-600 text-white bg-transparent hover:bg-gray-700 transition-colors"
          onClick={() => onNavigate(Navigate.PREVIOUS)}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          className="px-3 py-1.5 rounded-md border border-gray-600 text-white bg-transparent hover:bg-gray-700 transition-colors"
          onClick={() => onNavigate(Navigate.TODAY)}
        >
          Today
        </button>
        <button
          className="px-3 py-1.5 rounded-md border border-gray-600 text-white bg-transparent hover:bg-gray-700 transition-colors"
          onClick={() => onNavigate(Navigate.NEXT)}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <span className="text-white font-medium text-lg">{label}</span>
      <div className="flex items-center gap-2">
        <button
          className={`px-3 py-1.5 rounded-md transition-colors ${view === Views.MONTH ? 'bg-indigo-600 text-white' : 'border border-gray-600 text-white bg-transparent hover:bg-gray-700'}`}
          onClick={() => setView(Views.MONTH)}
        >
          Month
        </button>
        <button
          className={`px-3 py-1.5 rounded-md transition-colors ${view === Views.WEEK ? 'bg-indigo-600 text-white' : 'border border-gray-600 text-white bg-transparent hover:bg-gray-700'}`}
          onClick={() => setView(Views.WEEK)}
        >
          Week
        </button>
      </div>
    </div>
  );

  return (
    <Card className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">Calendar View</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="calendar-container" style={{ height: '500px' }}>
          <style>{`
                        .rbc-calendar {
                            background-color: #0d0d0d;
                            color: white;
                        }
                        .rbc-header {
                            background-color: #121212;
                            color: white;
                            border-color: rgba(255,255,255,0.08) !important;
                            padding: 8px;
                        }
                        .rbc-month-view, .rbc-time-view {
                            border-color: rgba(255,255,255,0.08) !important;
                            background-color: #0d0d0d;
                        }
                        .rbc-month-row {
                            border-color: rgba(255,255,255,0.08) !important;
                        }
                        .rbc-day-bg {
                            background-color: #0d0d0d;
                            border-color: rgba(255,255,255,0.08) !important;
                        }
                        .rbc-day-bg + .rbc-day-bg {
                            border-left: 1px solid rgba(255,255,255,0.08);
                        }
                        .rbc-off-range-bg {
                            background-color: #0A0A14;
                        }
                        .rbc-today {
                            background-color: rgba(255, 255, 255, 0.06) !important;
                        }
                        .rbc-button-link {
                            color: white;
                        }
                        .rbc-show-more {
                            color: var(--text-mid);
                            background: transparent;
                        }
                        .rbc-date-cell {
                            color: white;
                            padding: 4px 8px;
                        }
                        .rbc-date-cell.rbc-off-range {
                            color: #4B5563;
                        }
                        .rbc-row-segment {
                            padding: 0 2px;
                        }
                        .rbc-event {
                            border: none !important;
                        }
                        .rbc-row-content {
                            z-index: 1;
                        }
                        .rbc-time-header-content {
                            border-color: rgba(255,255,255,0.08) !important;
                        }
                        .rbc-time-content {
                            background-color: #0d0d0d;
                            border-color: rgba(255,255,255,0.08) !important;
                        }
                        .rbc-time-slot {
                            border-color: rgba(255,255,255,0.08) !important;
                        }
                        .rbc-timeslot-group {
                            border-color: rgba(255,255,255,0.08) !important;
                        }
                        .rbc-label {
                            color: #9CA3AF;
                        }
                        .rbc-allday-cell {
                            background-color: #0d0d0d;
                        }
                        /* Dim weekend columns */
                        .rbc-month-view .rbc-month-row .rbc-day-bg:first-child,
                        .rbc-month-view .rbc-month-row .rbc-day-bg:last-child {
                            background-color: rgba(255,255,255,0.025);
                        }
                    `}</style>
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            view={view}
            onView={(newView: View) => setView(newView)}
            date={currentDate}
            onNavigate={handleNavigate}
            onSelectEvent={handleSelectEvent}
            eventPropGetter={eventStyleGetter}
            components={{
              toolbar: CustomToolbar as React.ComponentType<ToolbarProps<CalendarEvent>>,
            }}
          />
        </div>
        <div className="flex items-center gap-4 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: getStatusColor('done') }} />
            <span className="text-[#737373]">Done</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: getStatusColor('in_progress') }}
            />
            <span className="text-[#737373]">In Progress</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-[#EF4444]" />
            <span className="text-[#737373]">Overdue</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: getStatusColor('todo') }} />
            <span className="text-[#737373]">To Do</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default CalendarView;
