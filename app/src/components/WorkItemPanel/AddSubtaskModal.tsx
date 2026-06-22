import { useState } from 'react';
import { X, Plus, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { parseLocalDate, formatLocalDate } from '@/components/ProjectsPage/utils';
import { CALENDAR_CLASS_NAMES } from './constants';
import type { ProjectDeveloperEntry } from '@/client';

export interface AddSubtaskFormValues {
  title: string;
  assignee_id: number | null;
  estimated_hours: string;
  due_date: string;
}

interface AddSubtaskModalProps {
  developers: ProjectDeveloperEntry[];
  isPending: boolean;
  onClose: () => void;
  onSubmit: (form: AddSubtaskFormValues) => void;
}

const empty: AddSubtaskFormValues = {
  title: '',
  assignee_id: null,
  estimated_hours: '',
  due_date: '',
};

export const AddSubtaskModal = ({
  developers,
  isPending,
  onClose,
  onSubmit,
}: AddSubtaskModalProps) => {
  const [form, setForm] = useState<AddSubtaskFormValues>(empty);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    onSubmit({ ...form, title: form.title.trim() });
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
          <h2 className="text-lg font-bold text-white">Add Subtask</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">Title</label>
            <Input
              autoFocus
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && form.title.trim()) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Subtask title…"
              className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[#737373] block mb-1.5">Assignee</label>
              <select
                value={form.assignee_id ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    assignee_id: e.target.value ? parseInt(e.target.value) : null,
                  }))
                }
                className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl px-3 text-sm"
              >
                <option value="">Unassigned</option>
                {developers.map((dev) => (
                  <option key={dev.id} value={dev.id}>
                    {dev.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-[#737373] block mb-1.5">
                Estimated Hours
              </label>
              <NumberInput
                min={0}
                max={999}
                value={form.estimated_hours}
                onChange={(e) => setForm((f) => ({ ...f, estimated_hours: e.target.value }))}
                placeholder="0"
                className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-[#737373] block mb-1.5">Due Date</label>
            <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start text-left font-normal bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F4F6FF] rounded-xl h-10"
                >
                  <Calendar className="w-4 h-4 mr-2 flex-shrink-0" />
                  <span>
                    {form.due_date
                      ? parseLocalDate(form.due_date)?.toLocaleDateString()
                      : 'Pick a date'}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                side="bottom"
                align="start"
                // z-[70] — must beat the AddSubtaskModal backdrop's z-[60].
                // Radix portals the popover to body and defaults to z-50 in
                // shadcn's base Popover style, which would render the
                // calendar BEHIND the modal. Same trap applies to any
                // shadcn popover used inside a modal with z >= 50.
                className="w-auto p-3 bg-[#0d0d0d] border border-[rgba(224,185,84,0.2)] z-[70]"
              >
                <CalendarIcon
                  mode="single"
                  selected={parseLocalDate(form.due_date || undefined)}
                  onSelect={(date) => {
                    if (date) {
                      setForm((f) => ({ ...f, due_date: formatLocalDate(date) }));
                      setShowDatePicker(false);
                    }
                  }}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  classNames={CALENDAR_CLASS_NAMES}
                />
                {form.due_date && (
                  <div className="pt-2 mt-2 border-t border-[rgba(255,255,255,0.05)]">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setForm((f) => ({ ...f, due_date: '' }));
                        setShowDatePicker(false);
                      }}
                      className="w-full text-xs text-[#737373] hover:text-white"
                    >
                      Clear date
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-5 border-t border-[rgba(255,255,255,0.05)]">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isPending}
            className="text-[#737373] rounded-xl px-5"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!form.title.trim() || isPending}
            className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-[#080808] font-medium rounded-xl px-6 shadow-lg shadow-[#B8872A]/20 disabled:opacity-50"
          >
            <Plus className="w-4 h-4 mr-2" />
            {isPending ? 'Adding…' : 'Add Subtask'}
          </Button>
        </div>
      </div>
    </div>
  );
};
