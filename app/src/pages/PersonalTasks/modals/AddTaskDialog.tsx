import { Calendar } from 'lucide-react';
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
import { parseLocalDate } from '@/lib/dateUtils';
import type { NewTaskForm, ProjectSummary } from '../types';
import { DUE_DATE_CALENDAR_CLASS_NAMES } from '../types';

interface AddTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newTask: NewTaskForm;
  setNewTask: (task: NewTaskForm) => void;
  showDatePicker: boolean;
  setShowDatePicker: (open: boolean) => void;
  projects: ProjectSummary[];
  onProjectChange: (projectId: string) => void;
  isCreating: boolean;
  onCreate: () => void;
}

const AddTaskDialog = ({
  open,
  onOpenChange,
  newTask,
  setNewTask,
  showDatePicker,
  setShowDatePicker,
  projects,
  onProjectChange,
  isCreating,
  onCreate,
}: AddTaskDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white">
        <DialogHeader>
          <DialogTitle>Create Personal Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs text-[#737373] mb-1 block">Title *</label>
            <Input
              value={newTask.title}
              onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
              placeholder="What needs to be done?"
              className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
            />
          </div>
          <div>
            <label className="text-xs text-[#737373] mb-1 block">Description</label>
            <Textarea
              value={newTask.description}
              onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
              placeholder="Add details..."
              className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white resize-none"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[#737373] mb-1 block">Priority</label>
              <Select
                value={newTask.priority}
                onValueChange={(v) => setNewTask({ ...newTask, priority: v })}
              >
                <SelectTrigger className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white h-10">
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
              <label className="text-xs text-[#737373] mb-1 block">Due Date</label>
              <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white hover:bg-[#0A0A14] hover:text-white h-10"
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    {newTask.due_date
                      ? parseLocalDate(newTask.due_date)?.toLocaleDateString()
                      : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-[#0A0A14] border-[rgba(255,255,255,0.08)]">
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
                        setShowDatePicker(false);
                      }
                    }}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    classNames={DUE_DATE_CALENDAR_CLASS_NAMES}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div>
            <label className="text-xs text-[#737373] mb-1 block">
              Project <span className="text-[#555]">(optional)</span>
            </label>
            <Select value={newTask.project_id} onValueChange={onProjectChange}>
              <SelectTrigger className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white h-10">
                <SelectValue placeholder="Choose a project..." />
              </SelectTrigger>
              <SelectContent className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)]">
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
              <label className="text-xs text-[#737373] mb-1 block">
                Estimated Hours <span className="text-[#555]">(optional)</span>
              </label>
              <Input
                value={newTask.estimated_hours}
                onChange={(e) => setNewTask({ ...newTask, estimated_hours: e.target.value })}
                className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white placeholder-[#444]"
              />
            </div>
          )}
          <Button
            onClick={onCreate}
            disabled={isCreating || !newTask.title.trim()}
            className="w-full bg-gradient-to-r from-[#E0B954] to-[#C79E3B] text-[#080808] font-semibold hover:opacity-90"
          >
            {isCreating ? 'Creating...' : 'Create Task'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddTaskDialog;
