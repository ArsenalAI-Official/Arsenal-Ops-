import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { type GridConfig, formatClock, formatDuration } from '../lib/calendar';

interface CalendarToolbarProps {
  weekRangeLabel: string;
  weekTotalHours: number;
  cfg: GridConfig;
  onPrev: () => void;
  onToday: () => void;
  onNext: () => void;
  /** Optional control (e.g. an admin employee picker) rendered before the
   *  working-hours pill. */
  slot?: React.ReactNode;
}

/** Top bar: week navigation, working-hours window, and the week total. */
export function CalendarToolbar({
  weekRangeLabel,
  weekTotalHours,
  cfg,
  onPrev,
  onToday,
  onNext,
  slot,
}: CalendarToolbarProps) {
  const navBtn =
    'w-[30px] h-[30px] flex items-center justify-center border border-white/[0.08] rounded-md text-[#a3a3a3] hover:text-white hover:bg-white/5';

  return (
    <div className="flex items-center justify-between px-[18px] py-3 border-b border-white/[0.08] flex-none">
      <div className="flex items-center gap-4">
        <div>
          <div className="text-[15px] font-semibold text-[#f5f5f5]">My Week</div>
          <div className="text-[11px] text-[#737373]">{weekRangeLabel}</div>
        </div>
        <div className="flex items-center gap-0.5 ml-1.5">
          <button type="button" aria-label="Previous week" onClick={onPrev} className={navBtn}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onToday}
            className="h-[30px] px-3 flex items-center border border-white/[0.08] rounded-md text-[12px] font-medium text-[#f5f5f5] hover:bg-white/5"
          >
            Today
          </button>
          <button type="button" aria-label="Next week" onClick={onNext} className={navBtn}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        {slot}
        <button
          type="button"
          aria-label="Calendar tips"
          title={`Working hours ${formatClock(cfg.workStartHour)} – ${formatClock(
            cfg.workEndHour,
          )} (shaded outside). Drag a ticket in · drag empty grid to draw · double-click for 1h · drag edges to resize.`}
          className="w-[30px] h-[30px] flex items-center justify-center border border-white/[0.08] rounded-md text-[#737373] hover:text-white hover:bg-white/5"
        >
          <Info className="w-4 h-4" />
        </button>
        <div className="flex items-center h-[30px] px-3 bg-[#E0B954]/[0.12] border border-[#E0B954]/25 rounded-md text-[11px] text-[#E0B954] font-semibold">
          {formatDuration(weekTotalHours)} logged
        </div>
      </div>
    </div>
  );
}
