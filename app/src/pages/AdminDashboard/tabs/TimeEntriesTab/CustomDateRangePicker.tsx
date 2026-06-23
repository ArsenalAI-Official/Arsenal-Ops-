import { useState } from 'react';
import { CALENDAR_CLASS_NAMES } from '@/components/ProjectsPage/constants';
import { parseLocalDate, formatLocalDate } from '@/components/ProjectsPage/utils';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * From / To calendar pair, modeled on the Personal Tasks due-date popover
 * so the keyboard / pointer behaviour stays uniform across the app.
 *
 * - From is bounded by To (can't pick a date after To).
 * - To is bounded by From (can't pick a date before From).
 * - The "From" input is empty by default — both dates default to unset so
 *   the admin can open a one-sided range (e.g. everything since June 1st).
 * - A "Clear" button on each picker resets that side without closing the
 *   popover, since clearing both is a common audit-export flow.
 */
const CustomDateRangePicker: React.FC<{
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}> = ({ from, to, onFromChange, onToChange }) => {
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const fromDate = parseLocalDate(from);
  const toDate = parseLocalDate(to);

  return (
    <div className="grid grid-cols-2 gap-3 mt-3">
      <div>
        <label className="text-[11px] text-[#737373] block mb-1">From</label>
        <Popover open={fromOpen} onOpenChange={setFromOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full h-9 bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.08)] text-[#F4F6FF] justify-start text-left font-normal text-xs hover:bg-[rgba(255,255,255,0.06)] hover:text-white"
            >
              {fromDate ? fromDate.toLocaleDateString() : 'Pick a date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="start"
            className="w-auto p-3 bg-[#0d0d0d] border border-[rgba(224,185,84,0.2)]"
          >
            <CalendarIcon
              mode="single"
              selected={fromDate}
              onSelect={(date) => {
                if (date) {
                  onFromChange(formatLocalDate(date));
                  setFromOpen(false);
                }
              }}
              // Block dates after `to` if To is already set, so the range
              // can never invert.
              disabled={toDate ? (date) => date > toDate : undefined}
              classNames={CALENDAR_CLASS_NAMES}
            />
            {from && (
              <button
                type="button"
                onClick={() => {
                  onFromChange('');
                  setFromOpen(false);
                }}
                className="mt-2 w-full text-[11px] text-[#737373] hover:text-white py-1 rounded"
              >
                Clear
              </button>
            )}
          </PopoverContent>
        </Popover>
      </div>
      <div>
        <label className="text-[11px] text-[#737373] block mb-1">To</label>
        <Popover open={toOpen} onOpenChange={setToOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full h-9 bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.08)] text-[#F4F6FF] justify-start text-left font-normal text-xs hover:bg-[rgba(255,255,255,0.06)] hover:text-white"
            >
              {toDate ? toDate.toLocaleDateString() : 'Pick a date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="start"
            className="w-auto p-3 bg-[#0d0d0d] border border-[rgba(224,185,84,0.2)]"
          >
            <CalendarIcon
              mode="single"
              selected={toDate}
              onSelect={(date) => {
                if (date) {
                  onToChange(formatLocalDate(date));
                  setToOpen(false);
                }
              }}
              disabled={fromDate ? (date) => date < fromDate : undefined}
              classNames={CALENDAR_CLASS_NAMES}
            />
            {to && (
              <button
                type="button"
                onClick={() => {
                  onToChange('');
                  setToOpen(false);
                }}
                className="mt-2 w-full text-[11px] text-[#737373] hover:text-white py-1 rounded"
              >
                Clear
              </button>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};

export default CustomDateRangePicker;
