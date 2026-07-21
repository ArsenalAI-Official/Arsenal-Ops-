import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { PaletteTicket } from '../types';
import { PaletteTicketChip } from './PaletteTicketChip';

const ticket = (over: Partial<PaletteTicket> = {}): PaletteTicket => ({
  workItemId: 1,
  key: 'ARS-1',
  title: 'A ticket',
  type: 'task',
  status: 'in_progress',
  remainingHours: 6,
  ...over,
});

const noop = () => {};

function renderChip(t: PaletteTicket, scheduledHours: number) {
  return render(
    <PaletteTicketChip
      ticket={t}
      active={false}
      scheduledHours={scheduledHours}
      onPointerDown={noop}
      onSelect={noop}
      onOpenDetail={noop}
      onChangeStatus={vi.fn()}
    />,
  );
}

describe('PaletteTicketChip remaining math', () => {
  it('does NOT double-subtract scheduled hours from remaining', () => {
    // remaining_hours already nets out logged blocks; the chip must show it
    // as-is. Regression: a 1h block on a 6h-remaining ticket previously read
    // "5h left" (6 - 1 again) — it must read "6h left".
    renderChip(ticket({ remainingHours: 6 }), 1);
    expect(screen.getByText('6h left')).toBeInTheDocument();
    expect(screen.queryByText('5h left')).not.toBeInTheDocument();
  });

  it('shows "fully scheduled" when nothing remains', () => {
    renderChip(ticket({ remainingHours: 0 }), 2);
    expect(screen.getByText('fully scheduled')).toBeInTheDocument();
  });

  it('shows over-allocation when remaining is negative', () => {
    renderChip(ticket({ remainingHours: -2 }), 0);
    expect(screen.getByText('2h over')).toBeInTheDocument();
  });
});
