import { X, Calendar } from 'lucide-react';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import StatusDotMenu from '../../StatusDotMenu';
import type { MyTask } from '../../types';
import { parseLocalDate } from '../../utils';
import { priorityColor, type MyTaskTab } from '../lib';

interface WorkItemRowProps {
  task: MyTask;
  myTaskTab: MyTaskTab;
  openDateRowId: string | null;
  setOpenDateRowId: (id: string | null) => void;
  onSelectTask: (task: MyTask) => void;
  onChangeTaskStatus: (task: MyTask, newStatus: string) => void;
  onQuickDueDateChange: (task: MyTask & { is_personal?: boolean }, isoDate: string) => void;
}

const WorkItemRow = ({
  task,
  myTaskTab,
  openDateRowId,
  setOpenDateRowId,
  onSelectTask,
  onChangeTaskStatus,
  onQuickDueDateChange,
}: WorkItemRowProps) => {
  return (
    <div
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
                    caption: 'flex justify-between items-center px-0 pb-3 relative h-7 mb-2',
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
  );
};

export default WorkItemRow;
