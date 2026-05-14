import React from 'react';
import { Loader2, Calendar } from 'lucide-react';
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

interface EditPersonalTaskForm {
  title: string;
  description: string;
  priority: string;
  due_date: string;
}

interface EditPersonalTaskDialogProps {
  isEditingPersonalTask: boolean;
  cancelEditPersonalTask: () => void;
  editPersonalTaskForm: EditPersonalTaskForm;
  setEditPersonalTaskForm: (form: EditPersonalTaskForm) => void;
  updatePersonalTask: () => void;
  addingTask: boolean;
  showCalendarEditPersonalTask: boolean;
  setShowCalendarEditPersonalTask: (open: boolean) => void;
}

const EditPersonalTaskDialog: React.FC<EditPersonalTaskDialogProps> = ({
  isEditingPersonalTask,
  cancelEditPersonalTask,
  editPersonalTaskForm,
  setEditPersonalTaskForm,
  updatePersonalTask,
  addingTask,
  showCalendarEditPersonalTask,
  setShowCalendarEditPersonalTask,
}) => {
  return (
    <Dialog
      open={isEditingPersonalTask}
      onOpenChange={(open) => {
        if (!open) cancelEditPersonalTask();
      }}
    >
      <DialogContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white">
        <DialogHeader>
          <DialogTitle>Edit Personal Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs text-[#737373] mb-1 block">Title</label>
            <Input
              value={editPersonalTaskForm.title}
              onChange={(e) =>
                setEditPersonalTaskForm({ ...editPersonalTaskForm, title: e.target.value })
              }
              placeholder="What needs to be done?"
              className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
            />
          </div>
          <div>
            <label className="text-xs text-[#737373] mb-1 block">Description</label>
            <Textarea
              value={editPersonalTaskForm.description}
              onChange={(e) =>
                setEditPersonalTaskForm({ ...editPersonalTaskForm, description: e.target.value })
              }
              placeholder="Add more details..."
              className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#737373] mb-1 block">Priority</label>
              <Select
                value={editPersonalTaskForm.priority}
                onValueChange={(value) =>
                  setEditPersonalTaskForm({ ...editPersonalTaskForm, priority: value })
                }
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
              <Popover
                open={showCalendarEditPersonalTask}
                onOpenChange={setShowCalendarEditPersonalTask}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white hover:bg-[#0A0A14] hover:text-white"
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    {editPersonalTaskForm.due_date
                      ? parseLocalDate(editPersonalTaskForm.due_date)?.toLocaleDateString()
                      : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-[#0A0A14] border-[rgba(255,255,255,0.08)]">
                  <CalendarIcon
                    mode="single"
                    selected={parseLocalDate(editPersonalTaskForm.due_date)}
                    onSelect={(date) => {
                      if (date) {
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        const localDate = `${year}-${month}-${day}`;
                        setEditPersonalTaskForm({ ...editPersonalTaskForm, due_date: localDate });
                        setShowCalendarEditPersonalTask(false);
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
          <div className="flex gap-2 pt-2">
            <Button
              onClick={updatePersonalTask}
              disabled={addingTask}
              className="flex-1 bg-gradient-to-r from-[#E0B954] to-[#C79E3B] text-[#080808] font-semibold hover:opacity-90"
            >
              {addingTask ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
            </Button>
            <Button
              onClick={cancelEditPersonalTask}
              disabled={addingTask}
              variant="outline"
              className="flex-1 bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white hover:bg-[#0A0A14] hover:text-white"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditPersonalTaskDialog;
