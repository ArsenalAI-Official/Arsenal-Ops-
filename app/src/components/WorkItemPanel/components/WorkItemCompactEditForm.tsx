import { Calendar } from 'lucide-react';
import type { ProjectDeveloperEntry } from '@/client';
import { parseLocalDate, formatLocalDate } from '@/components/ProjectsPage/utils';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { PRIORITY_OPTIONS, STATUS_OPTIONS, TYPE_OPTIONS_EDIT } from '@/lib/workItemConfig';
import { CALENDAR_CLASS_NAMES } from '../constants';
import type { WorkItem } from '../types';
import { WorkItemSelectField } from './WorkItemSelectField';

// Shared field styling, matched to WorkItemFullEditForm + the two-pane redesign.
const LABEL = 'mb-1.5 block text-xs font-medium text-[#8A8A8A]';
const FIELD =
  'w-full h-9 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[#F4F6FF]';
const SELECT = `${FIELD} px-3 text-sm`;

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
      <label className={LABEL}>Title</label>
      <Input
        value={editForm.title ?? ''}
        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
        className={FIELD}
      />
    </div>
    <div>
      <label className={LABEL}>Description</label>
      <Textarea
        value={editForm.description ?? ''}
        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
        className={`${FIELD} min-h-[120px] resize-none whitespace-pre-wrap`}
      />
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className={LABEL}>Type</label>
        <select
          value={editForm.type ?? item.type}
          onChange={(e) => setEditForm({ ...editForm, type: e.target.value as WorkItem['type'] })}
          className={SELECT}
        >
          <option value="user_story">Story</option>
          <option value="task">Task</option>
          <option value="bug">Bug</option>
          <option value="epic">Epic</option>
        </select>
      </div>
      <div>
        <label className={LABEL}>Priority</label>
        <select
          value={editForm.priority ?? item.priority}
          onChange={(e) =>
            setEditForm({ ...editForm, priority: e.target.value as WorkItem['priority'] })
          }
          className={SELECT}
        >
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
    </div>
    {/* Allocated Hours is hidden for epics (rollup from child estimates, not
        directly editable); grid drops to 1-col so Story Points isn't lonely. */}
    <div className={item.type === 'epic' ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-3'}>
      <div>
        <label className={LABEL}>Story Points</label>
        <NumberInput
          value={editForm.story_points ?? 0}
          onChange={(e) =>
            setEditForm({ ...editForm, story_points: parseInt(e.target.value) || 0 })
          }
          className={FIELD}
        />
      </div>
      {item.type !== 'epic' && (
        <div>
          <label className={LABEL}>Allocated Hours</label>
          <NumberInput
            value={editForm.assigned_hours ?? 0}
            onChange={(e) =>
              setEditForm({ ...editForm, assigned_hours: parseInt(e.target.value) || 0 })
            }
            className={FIELD}
          />
        </div>
      )}
    </div>
    <div>
      <label className={LABEL}>Status</label>
      <select
        value={editForm.status ?? item.status}
        onChange={(e) => setEditForm({ ...editForm, status: e.target.value as WorkItem['status'] })}
        className={SELECT}
      >
        <option value="todo">To Do</option>
        <option value="in_progress">In Progress</option>
        <option value="in_review">In Review</option>
        <option value="done">Done</option>
      </select>
    </div>
    <div>
      <label className={LABEL}>Due Date</label>
      <Popover open={showCalendarEditForm} onOpenChange={setShowCalendarEditForm}>
        <PopoverTrigger asChild>
          <Button
            className={`${FIELD} justify-start px-3 text-left font-normal hover:bg-[rgba(255,255,255,0.05)] hover:text-[#F4F6FF]`}
          >
            <Calendar className="mr-2 h-4 w-4 text-[#8A8A8A]" />
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
          className="w-auto border-[rgba(255,255,255,0.08)] bg-[#0d0d0d] p-0"
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
      <label className={LABEL}>Assignee</label>
      <select
        value={editForm.assignee_id ?? item.assignee_id ?? ''}
        onChange={(e) =>
          setEditForm({
            ...editForm,
            assignee_id: e.target.value ? parseInt(e.target.value) : null,
          })
        }
        className={SELECT}
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
        className="h-10 flex-1 rounded-xl bg-gradient-to-r from-[#E0B954] to-[#C79E3B] font-semibold text-[#080808] hover:opacity-90 disabled:opacity-70"
      >
        {isSavingEdit ? 'Saving…' : 'Save Changes'}
      </Button>
      <Button
        onClick={onCancel}
        variant="outline"
        className="h-10 flex-1 rounded-xl border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[#a3a3a3] hover:text-white"
      >
        Cancel
      </Button>
    </div>
  </div>
);
