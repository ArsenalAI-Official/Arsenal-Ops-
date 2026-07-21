import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import type { TimeBlockResponse } from '@/client';
import { API_BASE } from '@/mocks/handlers/constants';
import { resetTimeBlocks, seedTimeBlocks } from '@/mocks/handlers/timeBlocks';
import { server } from '@/mocks/node';
import { createTestQueryClient } from '@/test-utils/queryClient';
import { useWeekBlocks } from './useWeekBlocks';

const weekStart = new Date('2026-06-22T00:00:00.000Z');

function wrapper({ children }: { children: ReactNode }) {
  const client = createTestQueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const display = { key: 'ARS-1', title: 'T', type: 'task', status: 'in_progress' };

const seedBlock = (overrides: Partial<TimeBlockResponse> = {}): TimeBlockResponse => ({
  id: 5,
  work_item_id: 1,
  work_item_key: 'ARS-1',
  work_item_title: 'T',
  work_item_type: 'task',
  work_item_status: 'in_progress',
  hours: 1,
  description: null,
  start_time: '2026-06-22T09:00:00.000Z',
  end_time: '2026-06-22T10:00:00.000Z',
  ...overrides,
});

describe('useWeekBlocks', () => {
  beforeEach(() => resetTimeBlocks());

  it('creates a block and reflects it after the server confirms', async () => {
    const { result } = renderHook(() => useWeekBlocks(weekStart), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.createBlock({
        workItemId: 1,
        startISO: '2026-06-22T09:00:00.000Z',
        endISO: '2026-06-22T11:00:00.000Z',
        display,
      });
    });

    // The optimistic row appears (onMutate awaits cancelQueries, so it's async),
    // then the persisted row (positive id) replaces it after settle/refetch.
    await waitFor(() => expect(result.current.blocks.length).toBe(1));
    expect(result.current.blocks[0]?.hours).toBe(2);
    await waitFor(() => expect(result.current.blocks[0]?.id).toBeGreaterThan(0));
  });

  it('rolls the optimistic create back when the server rejects', async () => {
    server.use(
      http.post(`${API_BASE}/time-blocks`, () =>
        HttpResponse.json({ detail: 'Only the assignee can log time' }, { status: 403 }),
      ),
    );
    const { result } = renderHook(() => useWeekBlocks(weekStart), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.createBlock({
        workItemId: 1,
        startISO: '2026-06-22T09:00:00.000Z',
        endISO: '2026-06-22T10:00:00.000Z',
        display,
      });
    });
    // After the 403 the optimistic row is rolled back / never persisted.
    await waitFor(() => expect(result.current.blocks.length).toBe(0));
  });

  it('deletes a seeded block optimistically', async () => {
    seedTimeBlocks([seedBlock()]);
    const { result } = renderHook(() => useWeekBlocks(weekStart), { wrapper });
    await waitFor(() => expect(result.current.blocks.length).toBe(1));

    act(() => result.current.deleteBlock(5));
    await waitFor(() => expect(result.current.blocks.length).toBe(0));
  });

  it('rolls the optimistic create back on an overlap 409 (no phantom block)', async () => {
    server.use(
      http.post(`${API_BASE}/time-blocks`, () =>
        HttpResponse.json({ detail: 'This overlaps an existing ARS-1 block.' }, { status: 409 }),
      ),
    );
    const { result } = renderHook(() => useWeekBlocks(weekStart), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() =>
      result.current.createBlock({
        workItemId: 1,
        startISO: '2026-06-22T09:00:00.000Z',
        endISO: '2026-06-22T10:00:00.000Z',
        display,
      }),
    );
    await waitFor(() => expect(result.current.blocks.length).toBe(0));
  });

  it('surfaces ticket-logged entries (no start_time) in the unplaced tray, not blocks', async () => {
    seedTimeBlocks([seedBlock({ id: 9, hours: 2, start_time: null, end_time: null })]);
    const { result } = renderHook(() => useWeekBlocks(weekStart), { wrapper });
    await waitFor(() => expect(result.current.unplaced.length).toBe(1));
    expect(result.current.blocks.length).toBe(0);
    expect(result.current.unplaced[0]?.hours).toBe(2);
  });

  it('places a tray entry by PATCHing its position onto the SAME row (no new row)', async () => {
    seedTimeBlocks([seedBlock({ id: 9, hours: 2, start_time: null, end_time: null })]);
    const { result } = renderHook(() => useWeekBlocks(weekStart), { wrapper });
    await waitFor(() => expect(result.current.unplaced.length).toBe(1));

    act(() =>
      result.current.placeBlock({
        id: 9,
        startISO: '2026-06-23T10:00:00.000Z',
        endISO: '2026-06-23T12:00:00.000Z',
      }),
    );
    // Same id moves from unplaced -> positioned; duration (2h) preserved.
    await waitFor(() => expect(result.current.blocks.length).toBe(1));
    expect(result.current.blocks[0]?.id).toBe(9);
    expect(result.current.blocks[0]?.hours).toBe(2);
    expect(result.current.unplaced.length).toBe(0);
  });
});
