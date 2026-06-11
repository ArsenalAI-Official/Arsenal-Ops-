import { Calendar, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import type { EditTaskForm } from '../types';
import { PERSONAL_TASK_CALENDAR_CLASS_NAMES } from '../types';

interface EditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editForm: EditTaskForm;
  setEditForm: (form: EditTaskForm) => void;
  showCalendarEdit: boolean;
  setShowCalendarEdit: (open: boolean) => void;
  loading: boolean;
  onSave: () => void;
  onCancel: () => void;
}

const EditDialog = ({
  open,
  onOpenChange,
  editForm,
  setEditForm,
  showCalendarEdit,
  setShowCalendarEdit,
  loading,
  onSave,
  onCancel,
}: EditDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white">
        <DialogHeader>
          <DialogTitle>Edit Personal Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div>
            <label className="text-sm text-[#737373]">Title</label>
            <Input
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              placeholder="What needs to be done?"
              className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
            />
          </div>
          <div>
            <label className="text-sm text-[#737373]">Description</label>
            <Textarea
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              placeholder="Add more details..."
              className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-[#737373]">Priority</label>
              <Select
                value={editForm.priority}
                onValueChange={(value: any) => setEditForm({ ...editForm, priority: value })}
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
              <Popover open={showCalendarEdit} onOpenChange={setShowCalendarEdit}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white hover:bg-[#0A0A14] hover:text-white"
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    {editForm.due_date
                      ? parseLocalDate(editForm.due_date)?.toLocaleDateString()
                      : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-[#0A0A14] border-[rgba(255,255,255,0.08)]">
                  <CalendarIcon
                    mode="single"
                    selected={parseLocalDate(editForm.due_date)}
                    onSelect={(date) => {
                      if (date) {
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        const localDate = `${year}-${month}-${day}`;
                        setEditForm({ ...editForm, due_date: localDate });
                        setShowCalendarEdit(false);
                      }
                    }}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    classNames={PERSONAL_TASK_CALENDAR_CLASS_NAMES}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="flex gap-2 pt-4">
            <Button
              onClick={onSave}
              disabled={loading}
              className="flex-1 bg-[#E0B954] hover:bg-[#C79E3B] text-black"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
            </Button>
            <Button
              onClick={onCancel}
              disabled={loading}
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

export default EditDialog;
