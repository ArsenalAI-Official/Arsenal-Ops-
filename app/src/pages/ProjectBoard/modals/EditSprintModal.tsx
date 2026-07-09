import { X, Calendar, CheckCircle2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { SprintResponse } from '@/client';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { CALENDAR_CLASS_NAMES } from '@/lib/calendarClassNames';

export interface EditSprintFormValues {
  name: string;
  goal: string;
  start_date: string;
  end_date: string;
}

interface WorkItemLite {
  sprint_id: number | null;
  status: string;
}

export interface EditSprintModalProps {
  editingSprint: SprintResponse;
  parseLocalDate: (dateString: string | undefined) => Date | undefined;
  onClose: () => void;
  onSubmit: (form: EditSprintFormValues) => void;
}

const EditSprintModal = ({
  editingSprint,
  parseLocalDate,
  onClose,
  onSubmit,
}: EditSprintModalProps) => {
  const [editSprintForm, setEditSprintForm] = useState<EditSprintFormValues>(() => ({
    name: editingSprint.name,
    goal: editingSprint.goal || '',
    start_date: editingSprint.start_date ? editingSprint.start_date.split('T')[0]! : '',
    end_date: editingSprint.end_date ? editingSprint.end_date.split('T')[0]! : '',
  }));
  const [showCalendarEditSprintStart, setShowCalendarEditSprintStart] = useState(false);
  const [showCalendarEditSprintEnd, setShowCalendarEditSprintEnd] = useState(false);

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
          <h2 className="text-lg font-bold text-white">Edit Sprint</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">Sprint Name *</label>
            <Input
              value={editSprintForm.name}
              onChange={(e) => setEditSprintForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g., Sprint 1: Foundation"
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 placeholder:text-[#334155]"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">Sprint Goal</label>
            <Textarea
              value={editSprintForm.goal}
              onChange={(e) => setEditSprintForm((f) => ({ ...f, goal: e.target.value }))}
              placeholder="What do we want to achieve in this sprint?"
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl min-h-[80px] placeholder:text-[#334155] resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-[#737373] block mb-1.5">
                Start Date *
              </label>
              <Popover
                open={showCalendarEditSprintStart}
                onOpenChange={setShowCalendarEditSprintStart}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={`w-full bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 justify-start font-normal ${!editSprintForm.start_date ? 'text-[#737373]' : ''}`}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {editSprintForm.start_date
                      ? parseLocalDate(editSprintForm.start_date)?.toLocaleDateString()
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
                    selected={parseLocalDate(editSprintForm.start_date)}
                    onSelect={(date) => {
                      if (date) {
                        const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                        setEditSprintForm((f) => ({ ...f, start_date: localDate }));
                        setShowCalendarEditSprintStart(false);
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
                open={showCalendarEditSprintEnd && !!editSprintForm.start_date}
                onOpenChange={(open) =>
                  editSprintForm.start_date && setShowCalendarEditSprintEnd(open)
                }
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={!editSprintForm.start_date}
                    className={`w-full bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 justify-start font-normal ${!editSprintForm.end_date ? 'text-[#737373]' : ''} ${!editSprintForm.start_date ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {editSprintForm.end_date
                      ? parseLocalDate(editSprintForm.end_date)?.toLocaleDateString()
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
                    month={parseLocalDate(editSprintForm.start_date) || new Date()}
                    selected={parseLocalDate(editSprintForm.end_date)}
                    onSelect={(date) => {
                      if (date) {
                        const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                        setEditSprintForm((f) => ({ ...f, end_date: localDate }));
                        setShowCalendarEditSprintEnd(false);
                      }
                    }}
                    disabled={(date) =>
                      editSprintForm.start_date
                        ? date < parseLocalDate(editSprintForm.start_date)!
                        : false
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
            onClick={() => onSubmit(editSprintForm)}
            disabled={
              !editSprintForm.name.trim() || !editSprintForm.start_date || !editSprintForm.end_date
            }
            className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
          >
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
};

export interface CompleteSprintConfirmProps {
  sprintId: number;
  sprints: SprintResponse[];
  workItems: WorkItemLite[];
  onClose: () => void;
  onConfirm: () => void;
}

export const CompleteSprintConfirm = ({
  sprintId,
  sprints,
  workItems,
  onClose,
  onConfirm,
}: CompleteSprintConfirmProps) => {
  const sprint = sprints.find((s) => s.id === sprintId);
  const sprintItems = workItems.filter((w) => w.sprint_id === sprintId);
  const doneCount = sprintItems.filter((w) => w.status === 'done').length;
  const incompleteCount = sprintItems.length - doneCount;
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-sm shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-[rgba(64,190,134,0.1)] flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-status-done" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Complete Sprint</h3>
            <p className="text-xs text-[#737373] mt-0.5">{sprint?.name}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-[rgba(64,190,134,0.08)] border border-[rgba(64,190,134,0.2)] rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-status-done">{doneCount}</p>
            <p className="text-xs text-[#737373] mt-0.5">Completed</p>
          </div>
          <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-[#f5f5f5]">{incompleteCount}</p>
            <p className="text-xs text-[#737373] mt-0.5">Incomplete</p>
          </div>
        </div>
        {incompleteCount > 0 && (
          <p className="text-sm text-[#a3a3a3] mb-5">
            <span className="text-white font-medium">
              {incompleteCount} incomplete {incompleteCount === 1 ? 'item' : 'items'}
            </span>{' '}
            will be moved to the backlog.
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} className="text-[#737373] rounded-xl px-5">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-5 font-medium shadow-lg shadow-[#B8872A]/20"
          >
            Complete Sprint
          </Button>
        </div>
      </div>
    </div>
  );
};

export interface DeleteSprintConfirmProps {
  sprintId: number;
  sprints: SprintResponse[];
  workItems: WorkItemLite[];
  onClose: () => void;
  onConfirm: () => void;
}

export const DeleteSprintConfirm = ({
  sprintId,
  sprints,
  workItems,
  onClose,
  onConfirm,
}: DeleteSprintConfirmProps) => {
  const sprint = sprints.find((s) => s.id === sprintId);
  const itemCount = workItems.filter((w) => w.sprint_id === sprintId).length;
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-sm shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-[rgba(239,68,68,0.1)] flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5 text-[#EF4444]" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Delete Sprint</h3>
            <p className="text-xs text-[#737373] mt-0.5">{sprint?.name}</p>
          </div>
        </div>
        {itemCount > 0 && (
          <div className="bg-[rgba(239,68,68,0.05)] border border-[rgba(239,68,68,0.15)] rounded-xl p-3 mb-5">
            <p className="text-sm text-[#f5f5f5]">
              <span className="font-semibold text-[#EF4444]">
                {itemCount} {itemCount === 1 ? 'ticket' : 'tickets'}
              </span>{' '}
              will be moved to the backlog.
            </p>
          </div>
        )}
        <p className="text-sm text-[#737373] mb-5">
          This permanently deletes the sprint and cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} className="text-[#737373] rounded-xl px-5">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            className="bg-[#EF4444] hover:bg-[#DC2626] text-white rounded-xl px-5 font-medium"
          >
            Delete Sprint
          </Button>
        </div>
      </div>
    </div>
  );
};

export default EditSprintModal;
