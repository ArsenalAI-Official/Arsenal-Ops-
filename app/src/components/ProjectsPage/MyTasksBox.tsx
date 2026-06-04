import { useState } from 'react';
import {
  Plus,
  X,
  CheckSquare2,
  CheckCircle2,
  Edit2,
  Circle,
  Flag,
  ArrowRight,
  Calendar,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { useAuth } from '@/contexts/AuthContext';
import type { MyTask, PersonalTask } from './types';
import { parseLocalDate } from './utils';
import { STATUS_BARS } from './constants';
import StatusDotMenu from './StatusDotMenu';

type MyTaskTab = 'upcoming' | 'overdue' | 'completed' | 'personal';

interface MyTasksBoxProps {
  myTasks: MyTask[];
  personalTasks: PersonalTask[];
  myTasksLoading: boolean;
  myTaskTab: MyTaskTab;
  setMyTaskTab: (tab: MyTaskTab) => void;
  showAllTasks: boolean;
  setShowAllTasks: (next: boolean | ((prev: boolean) => boolean)) => void;
  onSelectTask: (task: MyTask) => void;
  onAddPersonalTaskClick: () => void;
  onEditPersonalTask: (task: PersonalTask) => void;
  onConvertPersonalTask: (task: PersonalTask) => void;
  onDeletePersonalTask: (taskId: number) => void;
  onTogglePersonalTaskComplete: (task: PersonalTask) => void;
  onNavigateToPersonalTasks: () => void;
  onChangeTaskStatus: (task: MyTask, newStatus: string) => void;
  onQuickDueDateChange: (task: MyTask & { is_personal?: boolean }, isoDate: string) => void;
}

const priorityColor = (priority: string): string => {
  if (priority === 'critical') return '#EF4444';
  if (priority === 'high') return '#F97316';
  if (priority === 'medium') return '#F59E0B';
  return '#737373';
};

const sortPersonalTasks = (a: PersonalTask, b: PersonalTask) => {
  if (a.status === 'done' && b.status !== 'done') return 1;
  if (a.status !== 'done' && b.status === 'done') return -1;
  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const aPriority = priorityOrder[a.priority?.toLowerCase() || 'medium'] ?? 999;
  const bPriority = priorityOrder[b.priority?.toLowerCase() || 'medium'] ?? 999;
  return aPriority - bPriority;
};

const sortUpcomingTasks = (tasks: MyTask[]) => {
  return [...tasks].sort((a, b) => {
    if (a.due_date && b.due_date) {
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    }
    if (a.due_date && !b.due_date) return -1;
    if (!a.due_date && b.due_date) return 1;
    return 0;
  });
};

const MyTasksBox = ({
  myTasks,
  personalTasks,
  myTasksLoading,
  myTaskTab,
  setMyTaskTab,
  showAllTasks,
  setShowAllTasks,
  onSelectTask,
  onAddPersonalTaskClick,
  onEditPersonalTask,
  onConvertPersonalTask,
  onDeletePersonalTask,
  onTogglePersonalTaskComplete,
  onNavigateToPersonalTasks,
  onChangeTaskStatus,
  onQuickDueDateChange,
}: MyTasksBoxProps) => {
  const [openDateRowId, setOpenDateRowId] = useState<string | null>(null);
  // "Tag to project" promotes a personal task into a project ticket via
  // POST /api/personal-tasks/{id}/convert-to-ticket — gated server-side on
  // `project.assign_personal_task`. Hide the per-task button when the user
  // lacks the cap so they don't get a 403 toast.
  const { can } = useAuth();
  const canAssignToProject = can('project.assign_personal_task');
  const filteredMyTasks = myTasks.filter((t) => {
    if (myTaskTab === 'upcoming') return t.status !== 'done' && !t.is_overdue;
    if (myTaskTab === 'overdue') return t.is_overdue;
    return t.status === 'done';
  });

  const sortedFiltered =
    myTaskTab === 'upcoming' ? sortUpcomingTasks(filteredMyTasks) : filteredMyTasks;
  const visibleTasks = showAllTasks ? sortedFiltered : sortedFiltered.slice(0, 6);
  const activePersonalTasks = personalTasks.filter((t) => !t.is_converted);
  const visiblePersonalTasks = [...activePersonalTasks].sort(sortPersonalTasks).slice(0, 5);

  return (
    <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded-2xl flex flex-col h-full">
      <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-white">My tasks</h2>
          <CheckSquare2 className="w-3.5 h-3.5 text-[#737373]" />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onAddPersonalTaskClick}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-gradient-to-r from-[#E0B954] to-[#C79E3B] hover:opacity-90 text-[#080808] transition-opacity"
            title="Add personal task"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-0 px-5 border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
        {(['upcoming', 'overdue', 'completed', 'personal'] as const).map((tab) => {
          const count =
            tab === 'upcoming'
              ? myTasks.filter((t) => t.status !== 'done' && !t.is_overdue).length
              : tab === 'overdue'
                ? myTasks.filter((t) => t.is_overdue).length
                : tab === 'personal'
                  ? personalTasks.filter((t) => !t.is_converted && t.status !== 'done').length
                  : myTasks.filter((t) => t.status === 'done').length;
          return (
            <button
              key={tab}
              onClick={() => {
                setMyTaskTab(tab);
                setShowAllTasks(false);
              }}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                myTaskTab === tab
                  ? 'border-[#E0B954] text-white'
                  : 'border-transparent text-[#737373] hover:text-[#a3a3a3]'
              }`}
            >
              {tab === 'overdue' && count > 0 ? (
                <span className="flex items-center gap-1.5">
                  Overdue
                  <span className="bg-red-500/20 text-red-400 text-xs px-1.5 py-0.5 rounded-full">
                    {count}
                  </span>
                </span>
              ) : tab === 'personal' ? (
                <span className="flex items-center gap-1.5">
                  Personal
                  {count > 0 && (
                    <span className="bg-[#E0B954]/20 text-[#E0B954] text-xs px-1.5 py-0.5 rounded-full">
                      {count}
                    </span>
                  )}
                </span>
              ) : (
                <span className="capitalize">{tab}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-0.5">
        {myTaskTab === 'personal' ? (
          activePersonalTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CheckCircle2 className="w-8 h-8 text-[#E0B954]/30 mb-2" />
              <p className="text-sm text-[#737373]">No personal tasks yet</p>
              <button
                onClick={onAddPersonalTaskClick}
                className="mt-3 text-xs text-[#E0B954] hover:text-[#C79E3B] flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add your first task
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {visiblePersonalTasks.map((task) => {
                const color = priorityColor(task.priority);
                return (
                  <div
                    key={task.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[rgba(255,255,255,0.03)] transition-colors group ${
                      task.status === 'done' ? 'opacity-60' : ''
                    }`}
                  >
                    <button
                      onClick={() => onTogglePersonalTaskComplete(task)}
                      className="flex-shrink-0 text-[#737373] hover:text-[#E0B954] transition-colors"
                      title={task.status === 'done' ? 'Mark as pending' : 'Mark as complete'}
                    >
                      {task.status === 'done' ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <Circle className="w-4 h-4" />
                      )}
                    </button>
                    <span
                      className={`flex-1 text-sm truncate ${
                        task.status === 'done' ? 'line-through text-[#737373]' : 'text-[#f5f5f5]'
                      }`}
                    >
                      {task.title}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-xs"
                      style={{
                        borderColor: color + '40',
                        color,
                        backgroundColor: color + '15',
                      }}
                    >
                      <Flag className="w-3 h-3 mr-1" />
                      {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                    </Badge>
                    <button
                      onClick={() => onEditPersonalTask(task)}
                      className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs text-[#E0B954] hover:text-[#C79E3B] flex-shrink-0 transition-opacity"
                      title="Edit task"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    {canAssignToProject && (
                      <button
                        onClick={() => onConvertPersonalTask(task)}
                        className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs text-[#E0B954] hover:text-[#C79E3B] flex-shrink-0 transition-opacity"
                        title="Convert to project ticket"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        Tag to project
                      </button>
                    )}
                    <button
                      onClick={() => onDeletePersonalTask(task.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-[#737373] hover:text-red-400 transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
              {activePersonalTasks.length > 5 && (
                <button
                  onClick={onNavigateToPersonalTasks}
                  className="w-full text-center text-xs text-[#737373] hover:text-[#E0B954] py-2.5 transition-colors"
                >
                  View all ({activePersonalTasks.length - 5} more) →
                </button>
              )}
            </div>
          )
        ) : myTasksLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-5 h-5 border-2 border-[#E0B954]/30 border-t-[#E0B954] rounded-full animate-spin" />
          </div>
        ) : filteredMyTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <CheckCircle2 className="w-8 h-8 text-[#E0B954]/30 mb-2" />
            <p className="text-sm text-[#737373]">
              {myTaskTab === 'completed'
                ? 'No completed tasks yet'
                : myTaskTab === 'overdue'
                  ? 'No overdue tasks 🎉'
                  : 'No upcoming tasks'}
            </p>
          </div>
        ) : (
          visibleTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-4 px-3 py-2.5 rounded-xl hover:bg-[rgba(255,255,255,0.03)] transition-colors cursor-pointer group"
              onClick={() => onSelectTask(task)}
            >
              <div className="w-[112px] flex-shrink-0 flex items-center">
                <span className="text-xs px-2 py-0.5 rounded-md bg-[rgba(224,185,84,0.08)] text-[#C79E3B] truncate min-w-0">
                  {task.project_name}
                </span>
              </div>
              <span
                className={`flex-1 min-w-0 text-sm truncate ${
                  task.status === 'done' ? 'line-through text-[#555]' : 'text-[#f5f5f5]'
                }`}
              >
                {task.title}
              </span>
              <div className="flex items-center flex-shrink-0 gap-3">
                <div className="w-[118px]">
                  <StatusDotMenu
                    status={task.status}
                    onChange={(newStatus) => onChangeTaskStatus(task, newStatus)}
                  />
                </div>
                <div className="w-[76px]">
                  {(myTaskTab === 'upcoming' || myTaskTab === 'overdue') &&
                    task.priority &&
                    (() => {
                      const color = priorityColor(task.priority);
                      return (
                        <span
                          className="text-xs px-2 py-0.5 rounded-md"
                          style={{ backgroundColor: `${color}15`, color }}
                        >
                          {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                        </span>
                      );
                    })()}
                </div>
                <div className="w-[96px]">
                  <Popover
                    open={openDateRowId === task.id}
                    onOpenChange={(o) => setOpenDateRowId(o ? task.id : null)}
                  >
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        title={
                          task.due_date
                            ? `Due ${parseLocalDate(task.due_date)?.toLocaleDateString()} — click to change`
                            : 'Set due date'
                        }
                        className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-all ${
                          task.is_overdue
                            ? 'bg-red-400/5 text-red-400 hover:bg-red-400/10'
                            : task.due_date
                              ? 'bg-[rgba(255,255,255,0.02)] text-[#a3a3a3] hover:text-[#E0B954]'
                              : 'text-[#555] hover:bg-[#E0B954]/5 hover:text-[#E0B954]'
                        }`}
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>
                          {task.due_date
                            ? parseLocalDate(task.due_date)?.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })
                            : 'Set date'}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-0 bg-[#0d0d0d] border-[rgba(255,255,255,0.07)] shadow-2xl rounded-xl overflow-hidden"
                      align="end"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)]">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-[#E0B954]" />
                          <div className="text-xs font-semibold text-white">Due date</div>
                        </div>
                        <div className="text-[11px] text-[#737373] mt-0.5 truncate max-w-[280px]">
                          {task.title}
                        </div>
                      </div>
                      <div className="p-2">
                        <CalendarIcon
                          mode="single"
                          selected={parseLocalDate(task.due_date || undefined)}
                          onSelect={(date) => {
                            if (date) {
                              const y = date.getFullYear();
                              const m = String(date.getMonth() + 1).padStart(2, '0');
                              const d = String(date.getDate()).padStart(2, '0');
                              onQuickDueDateChange(task, `${y}-${m}-${d}`);
                              setOpenDateRowId(null);
                            }
                          }}
                          classNames={{
                            months: 'flex flex-col',
                            month: 'space-y-3',
                            caption:
                              'flex justify-between items-center px-0 pb-3 relative h-7 mb-2',
                            caption_label: 'text-sm font-semibold text-white',
                            nav: 'space-x-1 flex items-center',
                            nav_button:
                              'text-[#a3a3a3] hover:text-[#E0B954] hover:bg-[rgba(224,185,84,0.1)] rounded-md p-1 transition-colors',
                            nav_button_previous: 'absolute left-0',
                            nav_button_next: 'absolute right-0',
                            table: 'w-full border-collapse',
                            head_row: 'flex',
                            head_cell:
                              'text-[10px] uppercase tracking-wider font-semibold text-[#737373] w-9 h-7 flex items-center justify-center',
                            row: 'flex w-full gap-0.5 mt-1',
                            cell: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
                            day: 'h-9 w-9 p-0 font-normal',
                            day_button:
                              'text-white hover:bg-[rgba(224,185,84,0.15)] hover:text-[#E0B954] rounded-lg h-9 w-9 transition-all',
                            day_selected:
                              'bg-gradient-to-br from-[#E0B954] to-[#C79E3B] text-[#0d0d0d] hover:from-[#E0B954] hover:to-[#C79E3B] hover:text-[#0d0d0d] font-bold shadow-lg shadow-[#E0B954]/30',
                            day_today: 'ring-1 ring-[#E0B954]/40 text-[#E0B954] font-semibold',
                            day_outside: 'text-[#3a3a3a]',
                            day_disabled: 'text-[#2a2a2a] opacity-40 cursor-not-allowed',
                            day_hidden: 'invisible',
                          }}
                        />
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 border-t border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)]">
                        {(['Today', 'Tomorrow', 'Next week'] as const).map((label) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => {
                              const d = new Date();
                              if (label === 'Tomorrow') d.setDate(d.getDate() + 1);
                              if (label === 'Next week') d.setDate(d.getDate() + 7);
                              const y = d.getFullYear();
                              const mo = String(d.getMonth() + 1).padStart(2, '0');
                              const dy = String(d.getDate()).padStart(2, '0');
                              onQuickDueDateChange(task, `${y}-${mo}-${dy}`);
                              setOpenDateRowId(null);
                            }}
                            className="flex-1 text-[11px] py-1.5 rounded-md bg-[rgba(255,255,255,0.04)] text-[#a3a3a3] hover:bg-[#E0B954]/15 hover:text-[#E0B954] transition-colors font-medium"
                          >
                            {label}
                          </button>
                        ))}
                        {task.due_date && (
                          <button
                            type="button"
                            onClick={() => {
                              onQuickDueDateChange(task, '');
                              setOpenDateRowId(null);
                            }}
                            title="Clear due date"
                            className="px-2 py-1.5 rounded-md text-[11px] text-[#737373] hover:bg-red-500/15 hover:text-red-400 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          ))
        )}
        {myTaskTab !== 'personal' && filteredMyTasks.length > 6 && (
          <button
            onClick={() => setShowAllTasks((p) => !p)}
            className="w-full text-center text-xs text-[#737373] hover:text-[#E0B954] py-2.5 transition-colors"
          >
            {showAllTasks ? 'Show less' : `Show ${filteredMyTasks.length - 6} more`}
          </button>
        )}
      </div>

      {(myTaskTab === 'upcoming' || myTaskTab === 'overdue') &&
        filteredMyTasks.length > 0 &&
        (() => {
          const bars = STATUS_BARS.filter((s) => s.key !== 'done');
          return (
            <div className="px-5 py-3 border-t border-[rgba(255,255,255,0.05)] flex-shrink-0">
              <div className="h-2 rounded-full overflow-hidden flex w-full mb-2">
                {bars.map((s) => {
                  const count = filteredMyTasks.filter((t) => t.status === s.key).length;
                  const pct = (count / filteredMyTasks.length) * 100;
                  return pct > 0 ? (
                    <div
                      key={s.key}
                      style={{ width: `${pct}%`, backgroundColor: s.color }}
                      title={`${s.label}: ${count}`}
                    />
                  ) : null;
                })}
              </div>
              <div className="flex flex-wrap gap-3">
                {bars.map((s) => {
                  const count = filteredMyTasks.filter((t) => t.status === s.key).length;
                  return (
                    <div key={s.key} className="flex items-center gap-1.5">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="text-xs text-[#737373]">
                        {s.label} <span className="text-white font-medium">{count}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
    </div>
  );
};

export default MyTasksBox;
