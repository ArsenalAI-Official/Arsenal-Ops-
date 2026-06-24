import { STATUS_CONFIG, TYPE_CONFIG } from '@/lib/workItemConfig';
import { formatHours } from '../lib/calendar';
import { CALENDAR } from '../lib/calendarTheme';
import type { PaletteTicket } from '../types';

interface PaletteTicketChipProps {
  ticket: PaletteTicket;
  active: boolean;
  /** Hours already scheduled this week against this ticket. */
  scheduledHours: number;
  onPointerDown: (e: React.PointerEvent) => void;
  onSelect: () => void;
}

const statusOf = (s: string) => STATUS_CONFIG[s as keyof typeof STATUS_CONFIG];
const typeOf = (t: string) => TYPE_CONFIG[t as keyof typeof TYPE_CONFIG];

/** A draggable ticket chip. Drag it onto the grid to create a block; clicking
 *  selects it as the default for blocks drawn directly on the grid. */
export function PaletteTicketChip({
  ticket,
  active,
  scheduledHours,
  onPointerDown,
  onSelect,
}: PaletteTicketChipProps) {
  const type = typeOf(ticket.type);
  const status = statusOf(ticket.status);
  const accent = status?.color ?? '#737373';

  const remaining = ticket.remainingHours - scheduledHours;
  const over = remaining < -1e-9;
  const pct =
    ticket.remainingHours > 0
      ? Math.min(100, (scheduledHours / ticket.remainingHours) * 100)
      : scheduledHours > 0
        ? 100
        : 0;
  const remLabel = over
    ? `${formatHours(-remaining)} over`
    : remaining <= 1e-9 && scheduledHours > 0
      ? 'fully scheduled'
      : `${formatHours(Math.max(0, remaining))} left`;
  const remColor = over ? CALENDAR.over : accent;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${ticket.key}: ${ticket.title}. Drag onto the calendar to log time.`}
      onPointerDown={onPointerDown}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      style={{
        background: active ? `${accent}1a` : 'rgba(255,255,255,0.025)',
        borderColor: active ? accent : 'rgba(255,255,255,0.06)',
      }}
      className="border rounded-[10px] px-[11px] py-2.5 cursor-grab transition-colors"
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span
          className="inline-flex items-center gap-1 px-1.5 rounded text-[10px] font-semibold"
          style={{ background: type?.bg, color: type?.color }}
        >
          <span
            className="w-1.5 h-1.5 rounded-sm"
            style={{ background: type?.color }}
            aria-hidden
          />
          {type?.label ?? ticket.type}
        </span>
        <span className="font-mono text-[10px] font-semibold text-[#E0B954]">{ticket.key}</span>
      </div>
      <div className="text-[12px] text-[#f5f5f5] leading-tight">{ticket.title}</div>
      <div className="mt-2 flex items-center gap-1.5">
        <div className="flex-1 h-[3px] bg-white/[0.06] rounded-sm overflow-hidden">
          <div
            className="h-full rounded-sm"
            style={{ width: `${pct.toFixed(1)}%`, background: remColor }}
          />
        </div>
        <span className="text-[9px] font-semibold whitespace-nowrap" style={{ color: remColor }}>
          {remLabel}
        </span>
      </div>
    </div>
  );
}
