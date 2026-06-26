import { Plus } from 'lucide-react';
import { PaletteTicketChip } from '../components/PaletteTicketChip';
import { formatDuration } from '../lib/calendar';
import type { PaletteTicket } from '../types';

interface TicketPaletteProps {
  tickets: PaletteTicket[];
  activeTicketId: number | null;
  /** workItemId -> hours scheduled this week (for the capacity bar). */
  scheduledByTicket: Record<number, number>;
  /** This week's logged hours per project, for the footer summary. */
  weekByProject: { label: string; hours: number }[];
  /** This week's total logged hours. */
  weekTotalHours: number;
  /** Hidden in read-only (admin viewing another calendar). */
  readOnly?: boolean;
  onChipPointerDown: (ticket: PaletteTicket, e: React.PointerEvent) => void;
  onSelectTicket: (ticket: PaletteTicket) => void;
  /** Double-click / Enter on a chip — open the ticket's full detail panel. */
  onOpenTicket: (ticket: PaletteTicket) => void;
  onChangeStatus: (ticket: PaletteTicket, status: string) => void;
  onNewTicket: () => void;
}

/** Left rail listing the user's assigned tickets — the drag source for blocks. */
export function TicketPalette({
  tickets,
  activeTicketId,
  scheduledByTicket,
  weekByProject,
  weekTotalHours,
  readOnly = false,
  onChipPointerDown,
  onSelectTicket,
  onOpenTicket,
  onChangeStatus,
  onNewTicket,
}: TicketPaletteProps) {
  return (
    <div className="w-[272px] flex-none border-r border-white/[0.08] flex flex-col min-h-0">
      <div className="px-3.5 pt-3.5 pb-2.5 flex-none flex items-center justify-between">
        <div className="text-[12px] font-semibold text-[#f5f5f5]">My Tickets</div>
        {readOnly ? (
          <div className="text-[10px] text-[#737373] bg-white/5 px-2 py-px rounded-full">
            {tickets.length} assigned
          </div>
        ) : (
          <button
            type="button"
            onClick={onNewTicket}
            className="flex items-center gap-1 text-[10px] text-[#a3a3a3] hover:text-white border border-white/[0.08] rounded-md px-2 py-1"
          >
            <Plus className="w-3 h-3" /> New
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-[11px] pb-3.5 flex flex-col gap-2">
        {tickets.length === 0 ? (
          <div className="text-[11px] text-[#555] px-1 py-6 text-center leading-relaxed">
            No assigned tickets. Tickets assigned to you appear here to drag onto the calendar.
          </div>
        ) : (
          tickets.map((t) => (
            <PaletteTicketChip
              key={t.workItemId}
              ticket={t}
              active={activeTicketId === t.workItemId}
              scheduledHours={scheduledByTicket[t.workItemId] ?? 0}
              readOnly={readOnly}
              onPointerDown={(e) => onChipPointerDown(t, e)}
              onSelect={() => onSelectTicket(t)}
              onOpenDetail={() => onOpenTicket(t)}
              onChangeStatus={(status) => onChangeStatus(t, status)}
            />
          ))
        )}
      </div>
      <div className="flex-none px-3.5 py-2.5 border-t border-white/[0.06]">
        {weekTotalHours > 0 ? (
          <>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-[#a3a3a3]">This week</span>
              <span className="text-[11px] font-semibold text-[#E0B954]">
                {formatDuration(weekTotalHours)}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {weekByProject.map((p) => (
                <div key={p.label} className="flex items-center justify-between text-[10px] gap-2">
                  <span className="text-[#a3a3a3] truncate">{p.label}</span>
                  <span className="text-[#737373] tabular-nums whitespace-nowrap">
                    {formatDuration(p.hours)}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-[10px] text-[#555] leading-snug">
            Drag a ticket onto the grid, or select one and draw on the calendar. The bar shows hours
            scheduled this week vs remaining.
          </div>
        )}
      </div>
    </div>
  );
}
