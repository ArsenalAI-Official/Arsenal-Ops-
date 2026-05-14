import React from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Helper function to parse YYYY-MM-DD string to local Date object (avoids UTC timezone issues)
const parseLocalDate = (dateString: string | undefined): Date | undefined => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-');
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
};

interface Project {
  id: number;
  name: string;
}

interface ProjectMember {
  id: number;
  name: string;
  email: string;
}

interface NewPersonalTask {
  title: string;
  description: string;
  priority: string;
  due_date: string;
  project_id: string;
  assignee_developer_id: string;
  estimated_hours: string;
}

interface AddPersonalTaskDialogProps {
  showAddTaskDialog: boolean;
  setShowAddTaskDialog: (open: boolean) => void;
  newPersonalTask: NewPersonalTask;
  setNewPersonalTask: (task: NewPersonalTask) => void;
  memberLookupProjectId: string;
  setMemberLookupProjectId: (id: string) => void;
  projectMembersForLookup: ProjectMember[];
  projects: Project[];
  createPersonalTask: () => void;
  addingTask: boolean;
  showCalendarAddTask: boolean;
  setShowCalendarAddTask: (open: boolean) => void;
}

const AddPersonalTaskDialog: React.FC<AddPersonalTaskDialogProps> = ({
  showAddTaskDialog,
  setShowAddTaskDialog,
  newPersonalTask,
  setNewPersonalTask,
  setMemberLookupProjectId,
  projectMembersForLookup,
  projects,
  createPersonalTask,
  addingTask,
  showCalendarAddTask,
  setShowCalendarAddTask,
}) => {
  return (
    <Dialog
      open={showAddTaskDialog}
      onOpenChange={(open) => {
        setShowAddTaskDialog(open);
        if (!open) {
          setNewPersonalTask({
            title: '',
            description: '',
            priority: 'medium',
            due_date: '',
            project_id: '',
            assignee_developer_id: '',
            estimated_hours: '',
          });
          setMemberLookupProjectId('');
        }
      }}
    >
      <DialogContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white">
        <DialogHeader>
          <DialogTitle>Add Personal Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs text-[#737373] mb-1 block">Title *</label>
            <Input
              value={newPersonalTask.title}
              onChange={(e) => setNewPersonalTask({ ...newPersonalTask, title: e.target.value })}
              placeholder="What needs to be done?"
              className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
              onKeyDown={(e) => e.key === 'Enter' && createPersonalTask()}
            />
          </div>
          <div>
            <label className="text-xs text-[#737373] mb-1 block">Description</label>
            <Textarea
              value={newPersonalTask.description}
              onChange={(e) =>
                setNewPersonalTask({ ...newPersonalTask, description: e.target.value })
              }
              placeholder="Add details..."
              className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white resize-none"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[#737373] mb-1 block">Priority</label>
              <Select
                value={newPersonalTask.priority}
                onValueChange={(v) => setNewPersonalTask({ ...newPersonalTask, priority: v })}
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
              <Popover open={showCalendarAddTask} onOpenChange={setShowCalendarAddTask}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white justify-start text-left font-normal hover:bg-[#0A0A14] hover:text-white"
                  >
                    {newPersonalTask.due_date
                      ? parseLocalDate(newPersonalTask.due_date)?.toLocaleDateString()
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
                    selected={parseLocalDate(newPersonalTask.due_date)}
                    onSelect={(date) => {
                      if (date) {
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        const localDate = `${year}-${month}-${day}`;
                        setNewPersonalTask({ ...newPersonalTask, due_date: localDate });
                        setShowCalendarAddTask(false);
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
                      day_selected:
                        'bg-[#E0B954] text-[#0d0d0d] hover:bg-[#E0B954] font-semibold',
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
          </div>
          {/* Project and Assignee dropdowns */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[#737373] mb-1 block">
                Project <span className="text-[#555]">(optional)</span>
              </label>
              <Select
                value={newPersonalTask.project_id}
                onValueChange={(v) => {
                  setNewPersonalTask({
                    ...newPersonalTask,
                    project_id: v,
                    assignee_developer_id: '',
                  });
                  setMemberLookupProjectId(v || '');
                }}
              >
                <SelectTrigger className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white">
                  <SelectValue placeholder="Choose a project..." />
                </SelectTrigger>
                <SelectContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newPersonalTask.project_id && (
              <div>
                <label className="text-xs text-[#737373] mb-1 block">
                  Assign To <span className="text-[#555]">(optional — defaults to you)</span>
                </label>
                <Select
                  value={newPersonalTask.assignee_developer_id}
                  onValueChange={(v) =>
                    setNewPersonalTask({ ...newPersonalTask, assignee_developer_id: v })
                  }
                >
                  <SelectTrigger className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white">
                    <SelectValue placeholder="Select team member..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
                    {projectMembersForLookup.length === 0 ? (
                      <div className="p-2 text-xs text-[#737373]">
                        No team members in this project
                      </div>
                    ) : (
                      projectMembersForLookup.map((member) => (
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
          {newPersonalTask.project_id && (
            <div>
              <label className="text-xs text-[#737373] mb-1 block">
                Estimated Hours <span className="text-[#555]">(optional)</span>
              </label>
              <Input
                value={newPersonalTask.estimated_hours}
                onChange={(e) =>
                  setNewPersonalTask({ ...newPersonalTask, estimated_hours: e.target.value })
                }
                className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white placeholder-[#444]"
              />
            </div>
          )}
          <Button
            onClick={createPersonalTask}
            disabled={addingTask || !newPersonalTask.title.trim()}
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
