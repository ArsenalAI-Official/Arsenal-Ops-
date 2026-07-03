import { X, Calendar, Flag } from 'lucide-react';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getPriorityColor } from '@/lib/workItemConfig';
import { STATUS_COLOR } from '../../constants';
import StatusDotMenu from '../../StatusDotMenu';
import type { MyTask } from '../../types';
import { parseLocalDate } from '../../utils';
import { projectDotColor } from '../lib';

interface WorkItemRowProps {
  task: MyTask;
  openDateRowId: string | null;
  setOpenDateRowId: (id: string | null) => void;
  onSelectTask: (task: MyTask) => void;
  onChangeTaskStatus: (task: MyTask, newStatus: string) => void;
  onQuickDueDateChange: (task: MyTask & { is_personal?: boolean }, isoDate: string) => void;
}

const WorkItemRow = ({
  task,
  openDateRowId,
  setOpenDateRowId,
  onSelectTask,
  onChangeTaskStatus,
  onQuickDueDateChange,
}: WorkItemRowProps) => {
  const isLoudPriority = task.priority === 'critical' || task.priority === 'high';
  const statusColor = STATUS_COLOR[task.status] || '#555';

  return (
    <div
      className="flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-[rgba(255,255,255,0.035)] transition-colors cursor-pointer group"
      onClick={() => onSelectTask(task)}
    >
      {/* Decorative status dot — the interactive status control is the
          StatusDotMenu pill on the right. */}
      <span
        className="w-2.5 h-2.5 rounded-full mt-[5px] flex-shrink-0"
        style={{ backgroundColor: statusColor }}
      />
      <div className="flex-1 min-w-0">
        <div
          title={task.title}
          className={`clamp2 text-[13.5px] leading-[1.4] ${
            task.status === 'done' ? 'line-through text-[#6f6f6f]' : 'text-[#e8e8e8]'
          }`}
        >
          {task.title}
        </div>
        <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-[#9a9a9a] min-w-0">
            <span
              className="w-1.5 h-1.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: projectDotColor(task.project_id) }}
            />
            <span className="truncate max-w-[180px]">{task.project_name}</span>
          </span>
          <span className="font-mono text-[10.5px] text-[#6f6f6f] flex-shrink-0">{task.key}</span>
          {task.priority &&
            (() => {
              // Show every priority; emphasize critical/high with their color +
              // a flag, mute medium/low to grey so the loud ones still stand out.
              const color = isLoudPriority ? getPriorityColor(task.priority) : 'var(--progress)';
              const bg = isLoudPriority
                ? `${getPriorityColor(task.priority)}22`
                : 'rgba(255,255,255,0.05)';
              return (
                <span
                  className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0"
                  style={{ backgroundColor: bg, color }}
                >
                  {isLoudPriority && <Flag className="w-2.5 h-2.5" />}
                  {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                </span>
              );
            })()}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <div>
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
                      ? 'bg-[rgba(255,255,255,0.02)] text-[#a3a3a3] hover:text-white'
                      : 'text-[#555] hover:bg-[rgba(255,255,255,0.05)] hover:text-white'
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
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
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
                      'text-[#a3a3a3] hover:text-white hover:bg-[rgba(255,255,255,0.08)] rounded-md p-1 transition-colors',
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
                      'text-white hover:bg-[rgba(255,255,255,0.08)] hover:text-white rounded-lg h-9 w-9 transition-all',
                    day_selected:
                      'bg-brand text-[#0d0d0d] hover:bg-brand hover:text-[#0d0d0d] font-bold',
                    day_today: 'ring-1 ring-info/40 text-info font-semibold',
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
                    className="flex-1 text-[11px] py-1.5 rounded-md bg-[rgba(255,255,255,0.04)] text-[#a3a3a3] hover:bg-[rgba(255,255,255,0.08)] hover:text-white transition-colors font-medium"
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
        <StatusDotMenu
          status={task.status}
          onChange={(newStatus) => onChangeTaskStatus(task, newStatus)}
        />
      </div>
    </div>
  );
};

export default WorkItemRow;
