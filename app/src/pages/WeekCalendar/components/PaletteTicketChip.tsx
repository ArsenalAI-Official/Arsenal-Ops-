import { useEffect, useRef, useState } from 'react';
import { STATUS_CONFIG, TYPE_CONFIG } from '@/lib/workItemConfig';
import { formatHours } from '../lib/calendar';
import { CALENDAR } from '../lib/calendarTheme';
import type { PaletteTicket } from '../types';

interface PaletteTicketChipProps {
  ticket: PaletteTicket;
  active: boolean;
  /** Hours already scheduled this week against this ticket. */
  scheduledHours: number;
  readOnly?: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onSelect: () => void;
  /** Double-click (or Enter) opens the ticket's full detail panel. */
  onOpenDetail: () => void;
  onChangeStatus: (status: string) => void;
}

const statusOf = (s: string) => STATUS_CONFIG[s as keyof typeof STATUS_CONFIG];
const typeOf = (t: string) => TYPE_CONFIG[t as keyof typeof TYPE_CONFIG];
const STATUS_KEYS = ['todo', 'in_progress', 'in_review', 'done'] as const;
// Keep pointerdown/click on the status control from starting a chip drag/select.
const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();

/** A draggable ticket chip. Drag it onto the grid to create a block; clicking
 *  selects it as the default for blocks drawn directly on the grid. The status
 *  pill flips the ticket's status from within the calendar view. */
export function PaletteTicketChip({
  ticket,
  active,
  scheduledHours,
  readOnly = false,
  onPointerDown,
  onSelect,
  onOpenDetail,
  onChangeStatus,
}: PaletteTicketChipProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Dismiss the status menu on outside-click or Escape (WAI-ARIA menu-button).
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const type = typeOf(ticket.type);
  const status = statusOf(ticket.status);
  const accent = status?.color ?? '#737373';

  // A calendar block IS a logged TimeEntry, so the backend's remaining_hours
  // already nets out every scheduled block — do NOT subtract scheduledHours
  // again (that double-counts: a 1h block would read as -2h remaining).
  const remaining = ticket.remainingHours;
  const over = remaining < -1e-9;
  // Bar shows this week's scheduled hours as a fraction of the work still in
  // play (this week's scheduled + what's left to do).
  const base = scheduledHours + Math.max(0, remaining);
  const pct =
    base > 0 ? Math.min(100, (scheduledHours / base) * 100) : scheduledHours > 0 ? 100 : 0;
  const remLabel = over
    ? `${formatHours(-remaining)} over`
    : remaining <= 1e-9
      ? scheduledHours > 0
        ? 'fully scheduled'
        : 'no time left'
      : `${formatHours(remaining)} left`;
  const remColor = over ? CALENDAR.over : accent;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${ticket.key}: ${ticket.title}. Drag onto the calendar to log time. Enter opens the ticket; Space selects it for drawing.`}
      onPointerDown={onPointerDown}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpenDetail();
      }}
      // Mirror the calendar block's dual-action keyboard model: Enter opens the
      // full ticket (matches double-click), Space arms it for drawing on the grid.
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onOpenDetail();
        } else if (e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      style={{
        background: active ? `${accent}1a` : 'rgba(255,255,255,0.025)',
        borderColor: active ? accent : 'rgba(255,255,255,0.06)',
      }}
      className="relative border rounded-[10px] px-[11px] py-2.5 cursor-grab transition-colors"
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
        {!readOnly && (
          <div className="ml-auto relative" ref={menuRef}>
            <button
              type="button"
              aria-label="Change status"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onPointerDown={stop}
              onClick={(e) => {
                stop(e);
                setMenuOpen((o) => !o);
              }}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold"
              style={{ background: `${accent}26`, color: accent }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: accent }}
                aria-hidden
              />
              {status?.label ?? ticket.status}
              <span className="opacity-60">▾</span>
            </button>
            {menuOpen && (
              <div
                onPointerDown={stop}
                className="absolute right-0 top-[120%] z-30 flex flex-col bg-[#161616] border border-white/10 rounded-md p-1 shadow-xl min-w-[120px]"
              >
                {STATUS_KEYS.map((sk) => {
                  const sc = statusOf(sk);
                  return (
                    <button
                      key={sk}
                      type="button"
                      onClick={(e) => {
                        stop(e);
                        setMenuOpen(false);
                        if (sk !== ticket.status) onChangeStatus(sk);
                      }}
                      className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] text-left hover:bg-white/5"
                      style={{ color: sk === ticket.status ? sc?.color : '#cbcbcb' }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: sc?.color }}
                        aria-hidden
                      />
                      {sc?.label ?? sk}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
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
