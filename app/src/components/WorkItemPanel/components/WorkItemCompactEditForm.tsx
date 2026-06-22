import { Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { parseLocalDate, formatLocalDate } from '@/components/ProjectsPage/utils';
import type { WorkItem } from '../types';
import type { ProjectDeveloperEntry } from '@/client';
import { CALENDAR_CLASS_NAMES } from '../constants';

export interface WorkItemCompactEditFormProps {
  item: WorkItem;
  editForm: Partial<WorkItem>;
  setEditForm: React.Dispatch<React.SetStateAction<Partial<WorkItem>>>;
  compactEditDevs: ProjectDeveloperEntry[];
  showCalendarEditForm: boolean;
  setShowCalendarEditForm: (v: boolean) => void;
  isSavingEdit: boolean;
  onSaveEdit: () => void;
  onCancel: () => void;
}

export const WorkItemCompactEditForm = ({
  item,
  editForm,
  setEditForm,
  compactEditDevs,
  showCalendarEditForm,
  setShowCalendarEditForm,
  isSavingEdit,
  onSaveEdit,
  onCancel,
}: WorkItemCompactEditFormProps) => (
  <div className="space-y-4">
    <div>
      <label className="text-xs font-medium text-[#737373] block mb-1.5">Title</label>
      <Input
        value={editForm.title ?? ''}
        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
        className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
      />
    </div>
    <div>
      <label className="text-xs font-medium text-[#737373] block mb-1.5">Description</label>
      <Textarea
        value={editForm.description ?? ''}
        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
        className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[120px] resize-none whitespace-pre-wrap"
      />
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="text-xs font-medium text-[#737373] block mb-1.5">Type</label>
        <select
          value={editForm.type ?? item.type}
          onChange={(e) => setEditForm({ ...editForm, type: e.target.value as WorkItem['type'] })}
          className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
        >
          <option value="user_story">Story</option>
          <option value="task">Task</option>
          <option value="bug">Bug</option>
          <option value="epic">Epic</option>
        </select>
      </div>
      <div>
        <label className="text-xs font-medium text-[#737373] block mb-1.5">Priority</label>
        <select
          value={editForm.priority ?? item.priority}
          onChange={(e) =>
            setEditForm({ ...editForm, priority: e.target.value as WorkItem['priority'] })
          }
          className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
        >
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
    </div>
    {/* Hours grid — Allocated Hours is hidden for epics (its value is a
        rollup from child estimates, not directly editable). Grid drops
        to 1-col so Story Points doesn't sit lonely in a half-empty row.
        Mirrors the equivalent gating in WorkItemFullEditForm. */}
    <div className={item.type === 'epic' ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-3'}>
      <div>
        <label className="text-xs font-medium text-[#737373] block mb-1.5">Story Points</label>
        <NumberInput
          value={editForm.story_points ?? 0}
          onChange={(e) =>
            setEditForm({ ...editForm, story_points: parseInt(e.target.value) || 0 })
          }
          className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
        />
      </div>
      {item.type !== 'epic' && (
        <div>
          <label className="text-xs font-medium text-[#737373] block mb-1.5">Allocated Hours</label>
          <NumberInput
            value={editForm.assigned_hours ?? 0}
            onChange={(e) =>
              setEditForm({ ...editForm, assigned_hours: parseInt(e.target.value) || 0 })
            }
            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
          />
        </div>
      )}
    </div>
    <div>
      <label className="text-xs font-medium text-[#737373] block mb-1.5">Status</label>
      <select
        value={editForm.status ?? item.status}
        onChange={(e) => setEditForm({ ...editForm, status: e.target.value as WorkItem['status'] })}
        className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
      >
        <option value="todo">To Do</option>
        <option value="in_progress">In Progress</option>
        <option value="in_review">In Review</option>
        <option value="done">Done</option>
      </select>
    </div>
    <div>
      <label className="text-xs font-medium text-[#737373] block mb-1.5">Due Date</label>
      <Popover open={showCalendarEditForm} onOpenChange={setShowCalendarEditForm}>
        <PopoverTrigger asChild>
          <Button className="w-full justify-start text-left font-normal bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F4F6FF] rounded-xl h-10">
            <Calendar className="w-4 h-4 mr-2" />
            {editForm.due_date
              ? parseLocalDate(editForm.due_date as string)?.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'Pick a date'}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0 bg-[#0d0d0d] border-[rgba(255,255,255,0.07)]"
          align="start"
        >
          <CalendarIcon
            mode="single"
            selected={parseLocalDate(
              editForm.due_date === null ? undefined : (editForm.due_date as string | undefined),
            )}
            onSelect={(date) => {
              if (date) {
                setEditForm({ ...editForm, due_date: formatLocalDate(date) });
                setShowCalendarEditForm(false);
              }
            }}
            disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
            classNames={CALENDAR_CLASS_NAMES}
          />
        </PopoverContent>
      </Popover>
    </div>
    <div>
      <label className="text-xs font-medium text-[#737373] block mb-1.5">Assignee</label>
      <select
        value={editForm.assignee_id ?? item.assignee_id ?? ''}
        onChange={(e) =>
          setEditForm({
            ...editForm,
            assignee_id: e.target.value ? parseInt(e.target.value) : null,
          })
        }
        className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl px-3 text-sm"
      >
        <option value="">Unassigned</option>
        {compactEditDevs.map((dev) => (
          <option key={dev.id} value={dev.id}>
            {dev.name} ({dev.role})
          </option>
        ))}
      </select>
    </div>
    <div className="flex gap-3 pt-2">
      <Button
        onClick={onSaveEdit}
        disabled={isSavingEdit}
        className="flex-1 bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl h-10 font-medium"
      >
        {isSavingEdit ? 'Saving…' : 'Save Changes'}
      </Button>
      <Button
        onClick={onCancel}
        variant="outline"
        className="flex-1 bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#a3a3a3] hover:text-white rounded-xl h-10"
      >
        Cancel
      </Button>
    </div>
  </div>
);
