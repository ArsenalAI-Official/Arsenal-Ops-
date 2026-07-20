import { Loader2 } from 'lucide-react';
import type { ProjectDeveloperEntry } from '@/client';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { clampNonNegInt, blockNegativeKey } from '@/lib/inputUtils';
import { CALENDAR_CLASS_NAMES } from './constants';
import type { Project, NewPersonalTaskForm } from './types';
import { parseLocalDate, formatLocalDate } from './utils';

interface AddPersonalTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: NewPersonalTaskForm;
  setForm: (
    next: NewPersonalTaskForm | ((prev: NewPersonalTaskForm) => NewPersonalTaskForm),
  ) => void;
  showCalendar: boolean;
  setShowCalendar: (open: boolean) => void;
  projects: Project[];
  projectMembers: ProjectDeveloperEntry[];
  onProjectChange: (projectId: string) => void;
  addingTask: boolean;
  onCreate: () => void;
}

const AddPersonalTaskDialog = ({
  open,
  onOpenChange,
  form,
  setForm,
  showCalendar,
  setShowCalendar,
  projects,
  projectMembers,
  onProjectChange,
  addingTask,
  onCreate,
}: AddPersonalTaskDialogProps) => {
  // Assigning a personal task to a project goes through convert-to-ticket on
  // submit. Hide the project picker + dependent fields (assignee, est. hours)
  // when the user lacks the cap — the dialog still creates a personal task.
  const { can } = useAuth();
  const canAssignToProject = can('project.assign_personal_task');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white">
        <DialogHeader>
          <DialogTitle>Add Personal Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs text-[#737373] mb-1 block">Title *</label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="What needs to be done?"
              className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
              onKeyDown={(e) => e.key === 'Enter' && onCreate()}
            />
          </div>
          <div>
            <label className="text-xs text-[#737373] mb-1 block">Description</label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Add details..."
              className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white resize-none"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[#737373] mb-1 block">Priority</label>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm({ ...form, priority: v })}
              >
                <SelectTrigger className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-[#737373] mb-1 block">Due Date</label>
              <Popover open={showCalendar} onOpenChange={setShowCalendar}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white justify-start text-left font-normal hover:bg-[#0A0A14] hover:text-white"
                  >
                    {form.due_date
                      ? parseLocalDate(form.due_date)?.toLocaleDateString()
                      : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  side="bottom"
                  align="start"
                  className="w-auto p-3 bg-[#0d0d0d] border border-[rgba(224,185,84,0.2)]"
                >
                  <CalendarIcon
                    mode="single"
                    selected={parseLocalDate(form.due_date)}
                    onSelect={(date) => {
                      if (date) {
                        setForm({ ...form, due_date: formatLocalDate(date) });
                        setShowCalendar(false);
                      }
                    }}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    classNames={CALENDAR_CLASS_NAMES}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          {canAssignToProject && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-[#737373] mb-1 block">
                  Project <span className="text-[#555]">(optional)</span>
                </label>
                <Select value={form.project_id} onValueChange={onProjectChange}>
                  <SelectTrigger className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white">
                    <SelectValue placeholder="Choose a project..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
                    {[...projects]
                      .sort((a, b) =>
                        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
                      )
                      .map((project) => (
                        <SelectItem key={project.id} value={project.id.toString()}>
                          {project.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              {form.project_id && (
                <div>
                  <label className="text-xs text-[#737373] mb-1 block">
                    Assign To <span className="text-[#555]">(optional — defaults to you)</span>
                  </label>
                  <Select
                    value={form.assignee_developer_id}
                    onValueChange={(v) => setForm({ ...form, assignee_developer_id: v })}
                  >
                    <SelectTrigger className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white">
                      <SelectValue placeholder="Select team member..." />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
                      {projectMembers.length === 0 ? (
                        <div className="p-2 text-xs text-[#737373]">
                          No team members in this project
                        </div>
                      ) : (
                        projectMembers.map((member) => (
                          <SelectItem key={member.id} value={member.id.toString()}>
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#E0B954] to-[#C79E3B] flex items-center justify-center text-[#080808] text-xs font-bold">
                                {member.name.charAt(0).toUpperCase()}
                              </div>
                              {member.name}
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          {canAssignToProject && form.project_id && (
            <div>
              <label className="text-xs text-[#737373] mb-1 block">
                Estimated Hours <span className="text-[#555]">(optional)</span>
              </label>
              <Input
                type="number"
                min="0"
                value={form.estimated_hours}
                onKeyDown={blockNegativeKey}
                onChange={(e) =>
                  setForm({
                    ...form,
                    estimated_hours:
                      e.target.value === '' ? '' : String(clampNonNegInt(e.target.value)),
                  })
                }
                className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white placeholder-[#444]"
              />
            </div>
          )}
          <Button
            onClick={onCreate}
            disabled={addingTask || !form.title.trim()}
            className="w-full bg-gradient-to-r from-[#E0B954] to-[#C79E3B] text-[#080808] font-semibold hover:opacity-90"
          >
            {addingTask ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Task'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddPersonalTaskDialog;
