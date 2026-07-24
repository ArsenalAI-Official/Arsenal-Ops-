/**
 * Presentational tests for the Google Calendar card in the Integrations tab.
 *
 * IntegrationsTab is a pure presentational component (all data + handlers come
 * in as props), so no MSW / query client is needed — we render with props and
 * assert the calendar card's configured / not-configured states and that
 * "Sync now" is wired to the handler. The QuickBooks card is covered by the
 * container flow elsewhere; these props are the minimal stub to render it.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { CalendarStatusResponse } from '@/client';
import { renderPlain } from '@/test-utils/render';
import IntegrationsTab from './IntegrationsTab';

const baseProps = {
  loading: false,
  connected: false,
  integration: null,
  isConnecting: false,
  isDisconnecting: false,
  isSyncing: false,
  isRefreshingClients: false,
  onConnect: () => {},
  onDisconnect: () => {},
  onSync: () => {},
  onRefreshClients: () => {},
  calendarLoading: false,
  calendarStatus: null as CalendarStatusResponse | null,
  isCalendarSyncing: false,
  onCalendarSync: () => {},
};

const configuredStatus: CalendarStatusResponse = {
  configured: true,
  sync_in_progress: false,
  developer_count: 4,
  event_count: 12,
  window_start: '2026-06-06',
  window_end: '2026-06-12',
};

describe('IntegrationsTab — Google Calendar card', () => {
  it('shows the not-configured state with the env-var hint and no Sync button', () => {
    renderPlain(<IntegrationsTab {...baseProps} calendarStatus={null} />);

    expect(screen.getByText('Google Calendar')).toBeInTheDocument();
    expect(screen.getByText('Not configured')).toBeInTheDocument();
    expect(screen.getByText('GOOGLE_CALENDAR_SA_JSON')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sync now/i })).not.toBeInTheDocument();
  });

  it('shows the configured snapshot and fires onCalendarSync when Sync now is clicked', async () => {
    const onCalendarSync = vi.fn();
    const { user } = renderPlain(
      <IntegrationsTab
        {...baseProps}
        calendarStatus={configuredStatus}
        onCalendarSync={onCalendarSync}
      />,
    );

    // Configured pill + the live counts.
    expect(screen.getByText('Configured')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument(); // developers
    expect(screen.getByText('12')).toBeInTheDocument(); // meetings this week

    await user.click(screen.getByRole('button', { name: /sync now/i }));
    expect(onCalendarSync).toHaveBeenCalledTimes(1);
  });

  it('disables the button and reads "Sync running…" when a sync is already in progress', () => {
    renderPlain(
      <IntegrationsTab
        {...baseProps}
        calendarStatus={{ ...configuredStatus, sync_in_progress: true }}
      />,
    );

    const btn = screen.getByRole('button', { name: /sync running/i });
    expect(btn).toBeDisabled();
  });
});
