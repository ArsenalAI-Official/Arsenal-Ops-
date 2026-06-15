import { Calendar, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { WorkItemCombobox } from '@/components/WorkItemCombobox';
import {
  validateReparent,
  getAllowedTargetTypes,
  fieldSupportsType,
} from '@/lib/hierarchy/validateReparent';
import { parseLocalDate, formatLocalDate } from '@/components/ProjectsPage/utils';
import type { WorkItem, ProjectDeveloper } from '../types';
import { CALENDAR_CLASS_NAMES } from '../constants';

export interface WorkItemFullEditFormProps {
  item: WorkItem;
  itemDetail: WorkItem;
  editForm: Partial<WorkItem>;
  setEditForm: React.Dispatch<React.SetStateAction<Partial<WorkItem>>>;
  developers: ProjectDeveloper[] | undefined;
  fullWorkItems: WorkItem[];
  epicExcludeIds: Set<number>;
  parentExcludeIds: Set<number>;
  selectedItemHasChildren: boolean;
  showCalendarEditForm: boolean;
  setShowCalendarEditForm: (v: boolean) => void;
  isSavingEdit: boolean;
  onSaveEdit: () => void;
}

export const WorkItemFullEditForm = ({
  item,
  itemDetail,
  editForm,
  setEditForm,
  developers,
  fullWorkItems,
  epicExcludeIds,
  parentExcludeIds,
  selectedItemHasChildren,
  showCalendarEditForm,
  setShowCalendarEditForm,
  isSavingEdit,
  onSaveEdit,
}: WorkItemFullEditFormProps) => (
  <div className="space-y-4">
    <div>
      <label className="text-xs font-medium text-[#737373] block mb-1.5">Title</label>
      <Input
        defaultValue={item.title}
        onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
        className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
      />
    </div>
    <div>
      <label className="text-xs font-medium text-[#737373] block mb-1.5">Description</label>
      <Textarea
        defaultValue={itemDetail.description}
        onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
        className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[120px] resize-none whitespace-pre-wrap"
      />
    </div>
    <div className={item.type === 'epic' ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-3'}>
      <div>
        <label className="text-xs font-medium text-[#737373] block mb-1.5">Type</label>
        <select
          defaultValue={item.type}
          onChange={(e) => {
            const newType = e.target.value as WorkItem['type'];
            setEditForm((f) => {
              const next: Partial<WorkItem> = { ...f, type: newType };
              if (!fieldSupportsType(newType, 'epic_id')) {
                next.epic_id = null;
                next.epic_key = null;
              }
              if (!fieldSupportsType(newType, 'parent_id')) {
                next.parent_id = null;
                next.parent_key = null;
              }
              return next;
            });
          }}
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
          defaultValue={item.priority}
          onChange={(e) =>
            setEditForm((f) => ({ ...f, priority: e.target.value as WorkItem['priority'] }))
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
    <div className={item.type === 'epic' ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-3'}>
      <div>
        <label className="text-xs font-medium text-[#737373] block mb-1.5">Story Points</label>
        <NumberInput
          defaultValue={item.story_points}
          onChange={(e) =>
            setEditForm((f) => ({ ...f, story_points: parseInt(e.target.value) || 0 }))
          }
          className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
        />
      </div>
      {item.type !== 'epic' && (
        <div>
          <label className="text-xs font-medium text-[#737373] block mb-1.5">Allocated Hours</label>
          <NumberInput
            defaultValue={item.assigned_hours}
            onChange={(e) =>
              setEditForm((f) => ({ ...f, assigned_hours: parseInt(e.target.value) || 0 }))
            }
            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
          />
        </div>
      )}
    </div>
    {item.type !== 'epic' && (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-[#737373] block mb-1.5">Logged Hours</label>
          <NumberInput
            defaultValue={item.logged_hours || 0}
            onChange={(e) =>
              setEditForm((f) => ({ ...f, logged_hours: parseInt(e.target.value) || 0 }))
            }
            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[#737373] block mb-1.5">Remaining Hours</label>
          <NumberInput
            defaultValue={item.remaining_hours}
            onChange={(e) =>
              setEditForm((f) => ({ ...f, remaining_hours: parseInt(e.target.value) || 0 }))
            }
            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
          />
        </div>
      </div>
    )}
    <div>
      <label className="text-xs font-medium text-[#737373] block mb-1.5">Assignee</label>
      <select
        value={editForm.assignee_id ?? item.assignee_id ?? ''}
        onChange={(e) =>
          setEditForm((f) => ({
            ...f,
            assignee_id: e.target.value ? parseInt(e.target.value) : null,
          }))
        }
        className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl px-3 text-sm"
      >
        <option value="">Unassigned</option>
        {developers?.map((dev) => (
          <option key={dev.id} value={dev.id}>
            {dev.name} ({dev.role})
          </option>
        ))}
      </select>
    </div>
    {fieldSupportsType((editForm.type ?? item.type) as WorkItem['type'], 'epic_id') && (
      <div>
        <label className="text-xs font-medium text-[#737373] block mb-1.5">Epic</label>
        <WorkItemCombobox
          value={editForm.epic_id ?? item.epic_id ?? null}
          valueKey={editForm.epic_key ?? item.epic_key ?? null}
          items={fullWorkItems}
          allowedTypes={getAllowedTargetTypes(
            (editForm.type ?? item.type) as WorkItem['type'],
            'epic_id',
          )}
          excludeIds={epicExcludeIds}
          onChange={(newId, newKey) => {
            const target =
              newId != null ? (fullWorkItems.find((wi) => wi.id === String(newId)) ?? null) : null;
            const v = validateReparent(
              { ...item, ...editForm, type: (editForm.type ?? item.type) as WorkItem['type'] },
              target,
              'epic_id',
              fullWorkItems,
            );
            if (!v.ok) {
              toast.error(v.reason ?? 'Invalid epic');
              return;
            }
            setEditForm((f) => ({ ...f, epic_id: newId, epic_key: newKey }));
          }}
          placeholder="No epic"
        />
      </div>
    )}
    {fieldSupportsType((editForm.type ?? item.type) as WorkItem['type'], 'parent_id') && (
      <div>
        <label
          className="text-xs font-medium text-[#737373] block mb-1.5"
          title="This task is part of a larger story or task."
        >
          Belongs to
        </label>
        <WorkItemCombobox
          value={editForm.parent_id ?? item.parent_id ?? null}
          valueKey={editForm.parent_key ?? item.parent_key ?? null}
          items={fullWorkItems}
          allowedTypes={getAllowedTargetTypes(
            (editForm.type ?? item.type) as WorkItem['type'],
            'parent_id',
          )}
          excludeIds={parentExcludeIds}
          disabled={selectedItemHasChildren}
          onChange={(newId, newKey) => {
            const target =
              newId != null ? (fullWorkItems.find((wi) => wi.id === String(newId)) ?? null) : null;
            const v = validateReparent(
              { ...item, ...editForm, type: (editForm.type ?? item.type) as WorkItem['type'] },
              target,
              'parent_id',
              fullWorkItems,
            );
            if (!v.ok) {
              toast.error(v.reason ?? 'Invalid parent');
              return;
            }
            setEditForm((f) => ({ ...f, parent_id: newId, parent_key: newKey }));
          }}
          placeholder="No parent"
        />
        {selectedItemHasChildren && (
          <p className="text-[10px] text-[#737373] mt-1.5 leading-snug">
            This task already has child tasks, so it can't be nested under another item.
          </p>
        )}
      </div>
    )}
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
              editForm.due_date === '' || !editForm.due_date
                ? undefined
                : (editForm.due_date as string),
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
    <Button
      onClick={onSaveEdit}
      disabled={isSavingEdit}
      className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl w-full h-10 disabled:opacity-70"
    >
      {isSavingEdit ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Saving…
        </>
      ) : (
        <>
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </>
      )}
    </Button>
  </div>
);
