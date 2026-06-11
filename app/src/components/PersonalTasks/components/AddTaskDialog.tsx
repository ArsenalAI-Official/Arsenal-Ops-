import { Plus, Briefcase, Loader2 } from 'lucide-react';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { parseLocalDate } from '@/lib/dateUtils';
import type { NewTaskForm, Project } from '../types';
import { PERSONAL_TASK_CALENDAR_CLASS_NAMES } from '../types';

interface AddTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newTask: NewTaskForm;
  setNewTask: (task: NewTaskForm) => void;
  showCalendar: boolean;
  setShowCalendar: (open: boolean) => void;
  projects: Project[];
  loading: boolean;
  onCreate: () => void;
}

const AddTaskDialog = ({
  open,
  onOpenChange,
  newTask,
  setNewTask,
  showCalendar,
  setShowCalendar,
  projects,
  loading,
  onCreate,
}: AddTaskDialogProps) => {
  return (
    <CardHeader className="flex flex-row items-center justify-between">
      <CardTitle className="text-white flex items-center gap-2">
        <Briefcase className="w-5 h-5" />
        My Personal Tasks
      </CardTitle>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <Button size="sm" className="bg-[#E0B954] hover:bg-[#C79E3B] text-black">
            <Plus className="w-4 h-4 mr-1" />
            Add Task
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white">
          <DialogHeader>
            <DialogTitle>Create Personal Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <label className="text-sm text-[#737373]">Title</label>
              <Input
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                placeholder="What needs to be done?"
                className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
              />
            </div>
            <div>
              <label className="text-sm text-[#737373]">Description</label>
              <Textarea
                value={newTask.description}
                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                placeholder="Add details..."
                className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-[#737373]">Priority</label>
                <Select
                  value={newTask.priority}
                  onValueChange={(v) => setNewTask({ ...newTask, priority: v })}
                >
                  <SelectTrigger className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)]">
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-[#737373]">Due Date</label>
                <Popover open={showCalendar} onOpenChange={setShowCalendar}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white justify-start text-left font-normal hover:bg-[#0A0A14] hover:text-white"
                    >
                      {newTask.due_date
                        ? parseLocalDate(newTask.due_date)?.toLocaleDateString()
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
                      selected={parseLocalDate(newTask.due_date)}
                      onSelect={(date) => {
                        if (date) {
                          const year = date.getFullYear();
                          const month = String(date.getMonth() + 1).padStart(2, '0');
                          const day = String(date.getDate()).padStart(2, '0');
                          const localDate = `${year}-${month}-${day}`;
                          setNewTask({ ...newTask, due_date: localDate });
                          setShowCalendar(false);
                        }
                      }}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      classNames={PERSONAL_TASK_CALENDAR_CLASS_NAMES}
                    />
                  </PopoverContent>
                </Popover>{' '}
              </div>{' '}
            </div>
            <div>
              <label className="text-sm text-[#737373]">Project</label>
              <Select
                value={newTask.project_id}
                onValueChange={(v) => setNewTask({ ...newTask, project_id: v })}
              >
                <SelectTrigger className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white">
                  <SelectValue placeholder="Choose a project..." />
                </SelectTrigger>
                <SelectContent className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)]">
                  <SelectItem value="">None</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newTask.project_id && (
              <div>
                <label className="text-sm text-[#737373]">Estimated Hours</label>
                <Input
                  value={newTask.estimated_hours}
                  onChange={(e) => setNewTask({ ...newTask, estimated_hours: e.target.value })}
                  className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white placeholder-[#444]"
                />
              </div>
            )}
            <Button
              onClick={onCreate}
              disabled={loading}
              className="w-full bg-[#E0B954] hover:bg-[#C79E3B] text-black"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Task'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </CardHeader>
  );
};

export default AddTaskDialog;
