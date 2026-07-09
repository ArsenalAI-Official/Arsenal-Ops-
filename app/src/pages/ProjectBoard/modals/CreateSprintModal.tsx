import { X, Plus, Calendar } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { CALENDAR_CLASS_NAMES } from '@/lib/calendarClassNames';

export interface NewSprintFormValues {
  name: string;
  goal: string;
  start_date: string;
  end_date: string;
}

export interface CreateSprintModalProps {
  parseLocalDate: (dateString: string | undefined) => Date | undefined;
  onClose: () => void;
  onSubmit: (form: NewSprintFormValues) => void;
  disabled: boolean;
}

const CreateSprintModal = ({
  parseLocalDate,
  onClose,
  onSubmit,
  disabled,
}: CreateSprintModalProps) => {
  const [newSprint, setNewSprint] = useState<NewSprintFormValues>({
    name: '',
    goal: '',
    start_date: '',
    end_date: '',
  });
  const [showCalendarSprintStart, setShowCalendarSprintStart] = useState(false);
  const [showCalendarSprintEnd, setShowCalendarSprintEnd] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      maxWidthClass="max-w-md"
      panelClassName="flex flex-col max-h-[90vh]"
    >
      <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
        <h2 className="text-lg font-bold text-white">Create New Sprint</h2>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-5 space-y-4 flex-1 overflow-y-auto">
        <div>
          <label className="text-xs font-medium text-[#737373] block mb-1.5">Sprint Name *</label>
          <Input
            value={newSprint.name}
            onChange={(e) => setNewSprint((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g., Sprint 1: Foundation"
            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 placeholder:text-[#334155]"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[#737373] block mb-1.5">Sprint Goal</label>
          <Textarea
            value={newSprint.goal}
            onChange={(e) => setNewSprint((f) => ({ ...f, goal: e.target.value }))}
            placeholder="What do we want to achieve in this sprint?"
            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[80px] placeholder:text-[#334155] resize-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">Start Date *</label>
            <Popover open={showCalendarSprintStart} onOpenChange={setShowCalendarSprintStart}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={`w-full bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 justify-start font-normal ${
                    !newSprint.start_date ? 'text-[#737373]' : ''
                  }`}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  {newSprint.start_date
                    ? parseLocalDate(newSprint.start_date)?.toLocaleDateString()
                    : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                side="bottom"
                align="start"
                className="w-auto p-3 bg-[#0d0d0d] border border-[rgba(255,255,255,0.12)]"
              >
                <CalendarIcon
                  mode="single"
                  selected={parseLocalDate(newSprint.start_date)}
                  onSelect={(date) => {
                    if (date) {
                      const year = date.getFullYear();
                      const month = String(date.getMonth() + 1).padStart(2, '0');
                      const day = String(date.getDate()).padStart(2, '0');
                      const localDate = `${year}-${month}-${day}`;
                      setNewSprint((f) => ({ ...f, start_date: localDate }));
                      setShowCalendarSprintStart(false);
                    }
                  }}
                  classNames={CALENDAR_CLASS_NAMES}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">End Date *</label>
            <Popover
              open={showCalendarSprintEnd && !!newSprint.start_date}
              onOpenChange={(open) => newSprint.start_date && setShowCalendarSprintEnd(open)}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  disabled={!newSprint.start_date}
                  className={`w-full bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 justify-start font-normal ${
                    !newSprint.end_date ? 'text-[#737373]' : ''
                  } ${!newSprint.start_date ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={!newSprint.start_date ? 'Set start date first' : ''}
                >
                  <Calendar className="mr-2 h-4 w-4" />
                  {newSprint.end_date
                    ? parseLocalDate(newSprint.end_date)?.toLocaleDateString()
                    : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                side="bottom"
                align="start"
                className="w-auto p-3 bg-[#0d0d0d] border border-[rgba(255,255,255,0.12)]"
              >
                <div className="mb-3 pb-3 border-b border-[rgba(255,255,255,0.05)]">
                  <p className="text-[10px] text-[#737373] font-medium uppercase mb-1.5">
                    Sprint Duration
                  </p>
                  <div className="space-y-1">
                    <p className="text-xs text-[#737373]">
                      Start:{' '}
                      <span className="text-muted-foreground font-medium">
                        {parseLocalDate(newSprint.start_date)?.toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </p>
                    <p className="text-xs text-[#737373]">
                      End: <span className="text-white font-medium">Pick a date</span>
                    </p>
                  </div>
                </div>
                <CalendarIcon
                  mode="single"
                  month={parseLocalDate(newSprint.start_date) || new Date()}
                  selected={parseLocalDate(newSprint.end_date)}
                  onSelect={(date) => {
                    if (date) {
                      const year = date.getFullYear();
                      const month = String(date.getMonth() + 1).padStart(2, '0');
                      const day = String(date.getDate()).padStart(2, '0');
                      const localDate = `${year}-${month}-${day}`;
                      setNewSprint((f) => ({ ...f, end_date: localDate }));
                      setShowCalendarSprintEnd(false);
                    }
                  }}
                  disabled={(date) =>
                    newSprint.start_date ? date < parseLocalDate(newSprint.start_date)! : false
                  }
                  classNames={CALENDAR_CLASS_NAMES}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-3 p-5 border-t border-[rgba(255,255,255,0.05)]">
        <Button variant="ghost" onClick={onClose} className="text-[#737373] rounded-xl px-5">
          Cancel
        </Button>
        <Button
          onClick={() => onSubmit(newSprint)}
          disabled={
            disabled || !newSprint.name.trim() || !newSprint.start_date || !newSprint.end_date
          }
          className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
          title={
            !newSprint.start_date || !newSprint.end_date ? 'Start and End dates are required' : ''
          }
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Sprint
        </Button>
      </div>
    </Modal>
  );
};

export default CreateSprintModal;
