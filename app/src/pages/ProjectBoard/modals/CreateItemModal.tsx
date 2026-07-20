import { X, Plus, Calendar } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { WorkItemCombobox } from '@/components/WorkItemCombobox';
import { CALENDAR_CLASS_NAMES } from '@/lib/calendarClassNames';
import {
  fieldSupportsType,
  getAllowedTargetTypes,
  type WorkItemType,
} from '@/lib/hierarchy/validateReparent';
import { clampNonNegInt, blockNegativeKey } from '@/lib/inputUtils';

export interface CreateItemFormValues {
  type: string;
  title: string;
  description: string;
  priority: string;
  story_points: number;
  assignee_id: number | null;
  sprint: string;
  epic_id: number | null;
  parent_id: number | null;
  due_date: string;
  estimated_hours: string | number;
  tags: string[];
}

interface Developer {
  id: number;
  name: string;
  role: string;
}

interface ProjectLite {
  developers?: Developer[];
}

interface WorkItemLite {
  id: string;
  key: string;
  title: string;
  type: WorkItemType;
  parent_id?: number | null;
  epic_id?: number | null;
}

export interface CreateItemModalProps {
  project: ProjectLite | null;
  workItems: WorkItemLite[];
  existingTags: string[];
  parseLocalDate: (dateString: string | undefined) => Date | undefined;
  isCreatingItem: boolean;
  onClose: () => void;
  onSubmit: (form: CreateItemFormValues) => void;
  initialType?: string;
}

const CreateItemModal = ({
  project,
  workItems,
  existingTags,
  parseLocalDate,
  isCreatingItem,
  onClose,
  onSubmit,
  initialType,
}: CreateItemModalProps) => {
  const [createForm, setCreateForm] = useState<CreateItemFormValues>({
    type: initialType ?? 'user_story',
    title: '',
    description: '',
    priority: 'medium',
    story_points: 3,
    assignee_id: null,
    sprint: 'Backlog',
    epic_id: null,
    parent_id: null,
    due_date: '',
    estimated_hours: '',
    tags: [],
  });
  const [tagInput, setTagInput] = useState('');
  const [showCalendarCreateForm, setShowCalendarCreateForm] = useState(false);

  // Depth-1 cap: an item that already has a parent cannot itself be picked
  // as a parent — that would create a depth-2 chain.
  const depth1ParentExclusions = useMemo(() => {
    const excluded = new Set<number>();
    for (const wi of workItems) {
      if (wi.parent_id != null) {
        const n = Number(wi.id);
        if (!Number.isNaN(n)) excluded.add(n);
      }
    }
    return excluded;
  }, [workItems]);

  const handleCreateItem = () => {
    if (!createForm.title.trim()) {
      toast.error('Title is required');
      return;
    }
    onSubmit(createForm);
  };

  return (
    <Modal
      open
      onClose={onClose}
      maxWidthClass="max-w-lg"
      panelClassName="flex flex-col max-h-[90vh]"
    >
      <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
        <h2 className="text-lg font-bold text-white">
          {createForm.type === 'epic' ? 'Create Epic' : 'Create Work Item'}
        </h2>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-5 space-y-4 flex-1 overflow-y-auto">
        {/* Type selector — hidden when the parent opens this modal with
              initialType='epic' (the "New Epic" menu item). Epics are
              structurally different from stories/tasks/bugs (no parent_id,
              no estimated_hours, etc.); allowing the user to flip the type
              mid-flow would surface the wrong fields and break the user's
              intent from the menu they clicked. */}
        {createForm.type !== 'epic' && (
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">Type</label>
            <select
              value={createForm.type}
              onChange={(e) => {
                const newType = e.target.value as WorkItemType;
                setCreateForm((f) => ({
                  ...f,
                  type: newType,
                  epic_id: fieldSupportsType(newType, 'epic_id') ? f.epic_id : null,
                  parent_id: fieldSupportsType(newType, 'parent_id') ? f.parent_id : null,
                  // Epics aggregate hours from descendants — don't carry over a
                  // value the user typed for a different type.
                  estimated_hours: newType === 'epic' ? '' : f.estimated_hours,
                }));
              }}
              className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
            >
              <option value="user_story">User Story</option>
              <option value="task">Task</option>
              <option value="bug">Bug</option>
            </select>
          </div>
        )}
        <div>
          <label className="text-xs font-medium text-[#737373] block mb-1.5">Title *</label>
          <Input
            value={createForm.title}
            onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Enter a concise title..."
            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 placeholder:text-[#334155]"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[#737373] block mb-1.5">Description</label>
          <Textarea
            value={createForm.description}
            onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Describe the requirements..."
            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[100px] placeholder:text-[#334155] resize-none whitespace-pre-wrap"
          />
        </div>
        <div
          className={
            createForm.type === 'task' ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-3 gap-3'
          }
        >
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">Priority</label>
            <select
              value={createForm.priority}
              onChange={(e) => setCreateForm((f) => ({ ...f, priority: e.target.value }))}
              className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          {createForm.type !== 'task' && (
            <div>
              <label className="text-xs font-medium text-[#737373] block mb-1.5">Points</label>
              <Input
                type="number"
                min="0"
                value={createForm.story_points || ''}
                onKeyDown={blockNegativeKey}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    story_points: clampNonNegInt(e.target.value),
                  }))
                }
                className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
              />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">Assignee</label>
            <select
              value={createForm.assignee_id || ''}
              onChange={(e) =>
                setCreateForm((f) => ({
                  ...f,
                  assignee_id: e.target.value ? parseInt(e.target.value) : null,
                }))
              }
              className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl px-3 text-sm"
            >
              <option value="">Unassigned</option>
              {project?.developers?.map((dev) => (
                <option key={dev.id} value={dev.id}>
                  {dev.name} ({dev.role})
                </option>
              ))}
            </select>
          </div>
        </div>
        {(fieldSupportsType(createForm.type as WorkItemType, 'epic_id') ||
          fieldSupportsType(createForm.type as WorkItemType, 'parent_id')) && (
          <div className="grid grid-cols-2 gap-3">
            {fieldSupportsType(createForm.type as WorkItemType, 'epic_id') && (
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">
                  Epic (optional)
                </label>
                <WorkItemCombobox
                  value={createForm.epic_id}
                  valueKey={null}
                  items={workItems}
                  allowedTypes={getAllowedTargetTypes(createForm.type as WorkItemType, 'epic_id')}
                  onChange={(newId) => setCreateForm((f) => ({ ...f, epic_id: newId }))}
                  placeholder="No epic"
                />
              </div>
            )}
            {fieldSupportsType(createForm.type as WorkItemType, 'parent_id') && (
              <div>
                <label
                  className="text-xs font-medium text-[#737373] block mb-1.5"
                  title="This task is part of a larger story or task."
                >
                  Belongs to (optional)
                </label>
                <WorkItemCombobox
                  value={createForm.parent_id}
                  valueKey={null}
                  items={workItems}
                  allowedTypes={getAllowedTargetTypes(createForm.type as WorkItemType, 'parent_id')}
                  excludeIds={depth1ParentExclusions}
                  onChange={(newId) => setCreateForm((f) => ({ ...f, parent_id: newId }))}
                  placeholder="No parent"
                />
              </div>
            )}
          </div>
        )}
        {createForm.type === 'task' && (
          /* Tags section for Tasks */
          <div className="p-3 rounded-lg bg-[rgba(224,185,84,0.08)] border border-[rgba(224,185,84,0.2)]">
            <label className="text-xs font-medium text-[#E0B954] block mb-1.5">
              Tags (Optional)
            </label>
            <p className="text-[10px] text-[#737373] mb-2">
              Organize tasks with tags. Type a new tag or select from existing ones.
            </p>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => {
                  setTagInput(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && tagInput.trim()) {
                    e.preventDefault();
                    const newTag = tagInput.trim().toLowerCase();
                    if (!createForm.tags?.includes(newTag)) {
                      setCreateForm((f) => {
                        const updatedTags = [...(f.tags || []), newTag];
                        return { ...f, tags: updatedTags };
                      });
                    }
                    setTagInput('');
                  }
                }}
                placeholder="Type tag and press Enter"
                className="flex-1 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 px-3 placeholder:text-[#334155] focus:outline-none focus:border-[#E0B954]/50"
              />
            </div>
            {/* Suggested existing tags */}
            {existingTags.length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] text-[#E0B954] font-medium mb-1.5">
                  Available Tags ({existingTags.length}):
                </p>
                <div className="flex flex-wrap gap-2">
                  {existingTags
                    .filter((t) => !createForm.tags?.includes(t))
                    .map((tag) => (
                      <button
                        key={tag}
                        onClick={() => {
                          setCreateForm((f) => {
                            const updated = [...(f.tags || []), tag];
                            return { ...f, tags: updated };
                          });
                        }}
                        className="px-3 py-1 rounded-lg bg-[rgba(224,185,84,0.15)] border border-[rgba(224,185,84,0.4)] text-[#E0B954] text-xs hover:bg-[rgba(224,185,84,0.25)] transition-colors cursor-pointer font-medium"
                      >
                        + {tag}
                      </button>
                    ))}
                </div>
              </div>
            )}
            {existingTags.length === 0 && (
              <div className="mb-2 p-2 rounded bg-[rgba(224,185,84,0.05)] border border-[rgba(224,185,84,0.15)]">
                <p className="text-[10px] text-[#737373]">
                  No existing tags yet. Create new ones by typing and pressing Enter!
                </p>
              </div>
            )}
            {/* Selected tags */}
            {createForm.tags && createForm.tags.length > 0 && (
              <div>
                <p className="text-[10px] text-[#737373] mb-1.5 font-medium">
                  Selected Tags ({createForm.tags.length}):
                </p>
                <div className="flex flex-wrap gap-2">
                  {createForm.tags.map((tag) => (
                    <div
                      key={tag}
                      className="px-2.5 py-1 rounded-lg bg-[rgba(224,185,84,0.2)] border border-[rgba(224,185,84,0.4)] text-[#E0B954] text-xs flex items-center gap-1.5 font-medium"
                    >
                      {tag}
                      <button
                        onClick={() => {
                          setCreateForm((f) => {
                            const updated = f.tags?.filter((t) => t !== tag) || [];
                            return { ...f, tags: updated };
                          });
                        }}
                        className="text-[#E0B954] hover:text-white ml-0.5"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {/* Due Date and Estimated Hours. Epics don't show Est. Hours — their
              hours are aggregated from descendant stories/tasks/bugs and the
              subtasks underneath those, so accepting a manual estimate on an
              epic would be misleading. */}
        <div
          className={
            createForm.type === 'epic' ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-2 gap-3'
          }
        >
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">
              Due Date (optional)
            </label>
            <Popover open={showCalendarCreateForm} onOpenChange={setShowCalendarCreateForm}>
              <PopoverTrigger asChild>
                <Button className="w-full justify-start text-left font-normal bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F4F6FF] rounded-xl h-10">
                  <Calendar className="w-4 h-4 mr-2" />
                  {createForm.due_date
                    ? parseLocalDate(createForm.due_date as string)?.toLocaleDateString('en-US', {
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
                    createForm.due_date === '' ? undefined : (createForm.due_date as string),
                  )}
                  onSelect={(date) => {
                    if (date) {
                      const year = date.getFullYear();
                      const month = String(date.getMonth() + 1).padStart(2, '0');
                      const day = String(date.getDate()).padStart(2, '0');
                      setCreateForm({ ...createForm, due_date: `${year}-${month}-${day}` });
                      setShowCalendarCreateForm(false);
                    }
                  }}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  classNames={CALENDAR_CLASS_NAMES}
                />
              </PopoverContent>
            </Popover>
          </div>
          {createForm.type !== 'epic' && (
            <div>
              <label className="text-xs font-medium text-[#737373] block mb-1.5">Est. Hours</label>
              <Input
                type="number"
                min="0"
                value={createForm.estimated_hours}
                onKeyDown={blockNegativeKey}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    estimated_hours:
                      e.target.value === '' ? '' : String(clampNonNegInt(e.target.value)),
                  }))
                }
                placeholder="Hours"
                className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
              />
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-3 p-5 border-t border-[rgba(255,255,255,0.05)] flex-shrink-0">
        <Button
          variant="ghost"
          onClick={onClose}
          className="text-[#737373] rounded-xl px-5"
          disabled={isCreatingItem}
        >
          Cancel
        </Button>
        <Button
          onClick={handleCreateItem}
          disabled={!createForm.title.trim() || isCreatingItem}
          className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
          title={!createForm.title.trim() ? 'Title is required' : ''}
        >
          {isCreatingItem ? (
            <>
              <Spinner size="xs" tone="white" className="mr-2" />
              Creating...
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 mr-2" /> Create Item
            </>
          )}
        </Button>
      </div>
    </Modal>
  );
};

export default CreateItemModal;
