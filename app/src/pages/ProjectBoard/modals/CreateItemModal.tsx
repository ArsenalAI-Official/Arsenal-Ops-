import { useState } from 'react';
import { X, Plus, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { toast } from 'sonner';

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
  type: string;
}

export interface CreateItemModalProps {
  project: ProjectLite | null;
  workItems: WorkItemLite[];
  existingTags: string[];
  parseLocalDate: (dateString: string | undefined) => Date | undefined;
  isCreatingItem: boolean;
  onClose: () => void;
  onSubmit: (form: CreateItemFormValues) => void;
}

const CreateItemModal = ({
  project,
  workItems,
  existingTags,
  parseLocalDate,
  isCreatingItem,
  onClose,
  onSubmit,
}: CreateItemModalProps) => {
  const [createForm, setCreateForm] = useState<CreateItemFormValues>({
    type: 'user_story',
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

  const handleCreateItem = () => {
    if (!createForm.title.trim()) {
      toast.error('Title is required');
      return;
    }
    onSubmit(createForm);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
          <h2 className="text-lg font-bold text-white">Create Work Item</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4 flex-1 overflow-y-auto">
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">Type</label>
            <select
              value={createForm.type}
              onChange={(e) => setCreateForm((f) => ({ ...f, type: e.target.value }))}
              className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
            >
              <option value="user_story">User Story</option>
              <option value="task">Task</option>
              <option value="bug">Bug</option>
              <option value="epic">Epic</option>
            </select>
          </div>
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
                  value={createForm.story_points}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      story_points: parseInt(e.target.value) || 0,
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
          {createForm.type !== 'task' && (
            /* Hierarchy - Hidden for Tasks */
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">
                  Epic (optional)
                </label>
                <select
                  value={createForm.epic_id || ''}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      epic_id: e.target.value ? parseInt(e.target.value) : null,
                    }))
                  }
                  className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
                >
                  <option value="">No Epic</option>
                  {workItems
                    .filter((wi) => wi.type === 'epic')
                    .map((wi) => (
                      <option key={wi.id} value={wi.id}>
                        {wi.key} — {wi.title}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">
                  Parent Story (optional)
                </label>
                <select
                  value={createForm.parent_id || ''}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      parent_id: e.target.value ? parseInt(e.target.value) : null,
                    }))
                  }
                  className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
                >
                  <option value="">No Parent</option>
                  {workItems
                    .filter((wi) => wi.type === 'user_story')
                    .map((wi) => (
                      <option key={wi.id} value={wi.id}>
                        {wi.key} — {wi.title}
                      </option>
                    ))}
                </select>
              </div>
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
          {/* Due Date and Estimated Hours */}
          <div className="grid grid-cols-2 gap-3">
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
                    classNames={{
                      months: 'flex flex-col',
                      month: 'space-y-4',
                      caption: 'flex justify-between items-center px-0 pb-4 relative h-7 mb-2',
                      caption_label: 'text-sm font-medium text-white',
                      nav: 'space-x-1 flex items-center',
                      nav_button: 'text-white hover:bg-[rgba(224,185,84,0.1)] rounded p-1',
                      nav_button_previous: 'absolute left-0',
                      nav_button_next: 'absolute right-0',
                      table: 'w-full border-collapse space-y-1',
                      head_row: 'flex',
                      head_cell:
                        'text-xs font-medium text-[#737373] w-8 h-8 flex items-center justify-center rounded',
                      row: 'flex w-full gap-1',
                      cell: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-transparent',
                      day: 'h-8 w-8 p-0 font-normal',
                      day_button:
                        'text-white hover:bg-[rgba(224,185,84,0.1)] rounded-lg h-8 w-8 transition-colors',
                      day_selected: 'bg-[#E0B954] text-[#0d0d0d] hover:bg-[#E0B954] font-semibold',
                      day_today: 'bg-[rgba(224,185,84,0.2)] text-[#E0B954] font-semibold',
                      day_outside: 'text-[#444]',
                      day_disabled: 'text-[#333] opacity-50 cursor-not-allowed',
                      day_range_middle:
                        'aria-selected:bg-[rgba(224,185,84,0.1)] aria-selected:text-white',
                      day_hidden: 'invisible',
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-xs font-medium text-[#737373] block mb-1.5">Est. Hours</label>
              <Input
                type="number"
                min="1"
                value={createForm.estimated_hours}
                onChange={(e) => setCreateForm((f) => ({ ...f, estimated_hours: e.target.value }))}
                placeholder="Hours"
                className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
              />
            </div>
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
                <div className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" /> Create Item
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CreateItemModal;
