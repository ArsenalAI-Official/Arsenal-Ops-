import { Calendar, Loader2 } from 'lucide-react';
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
import { CALENDAR_CLASS_NAMES } from './constants';
import type { EditPersonalTaskForm } from './types';
import { parseLocalDate, formatLocalDate } from './utils';

interface EditPersonalTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: EditPersonalTaskForm;
  setForm: (
    next: EditPersonalTaskForm | ((prev: EditPersonalTaskForm) => EditPersonalTaskForm),
  ) => void;
  showCalendar: boolean;
  setShowCalendar: (open: boolean) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

const EditPersonalTaskDialog = ({
  open,
  onOpenChange,
  form,
  setForm,
  showCalendar,
  setShowCalendar,
  saving,
  onSave,
  onCancel,
}: EditPersonalTaskDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white">
        <DialogHeader>
          <DialogTitle>Edit Personal Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs text-[#737373] mb-1 block">Title</label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="What needs to be done?"
              className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
            />
          </div>
          <div>
            <label className="text-xs text-[#737373] mb-1 block">Description</label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Add more details..."
              className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#737373] mb-1 block">Priority</label>
              <Select
                value={form.priority}
                onValueChange={(value) => setForm({ ...form, priority: value })}
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
                    className="w-full justify-start text-left font-normal bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white hover:bg-[#0A0A14] hover:text-white"
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    {form.due_date
                      ? parseLocalDate(form.due_date)?.toLocaleDateString()
                      : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-[#0A0A14] border-[rgba(255,255,255,0.08)]">
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
          <div className="flex gap-2 pt-2">
            <Button
              onClick={onSave}
              disabled={saving}
              className="flex-1 bg-gradient-to-r from-[#E0B954] to-[#C79E3B] text-[#080808] font-semibold hover:opacity-90"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
            </Button>
            <Button
              onClick={onCancel}
              disabled={saving}
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
