import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef } from 'react';
import { toast } from 'sonner';
import type {
  CreateTimeBlockRequest,
  TimeBlockResponse,
  UpdateTimeBlockRequest,
  WeekBlocksResponse,
} from '@/client';
import { apiFetch, ApiError } from '@/lib/api';
import { weekStartToISO } from '../lib/calendar';

const hoursBetween = (startISO: string, endISO: string): number =>
  Number(((new Date(endISO).getTime() - new Date(startISO).getTime()) / 3_600_000).toFixed(2));

export interface CreateBlockArgs {
  workItemId: number;
  startISO: string;
  endISO: string;
  /** Ticket display fields, used only to render the optimistic row. */
  display: { key: string; title: string; type: string; status: string };
}

export interface UpdateBlockArgs {
  id: number;
  startISO?: string;
  endISO?: string;
  workItemId?: number;
  /** Target ticket's display fields on a reassign, so the optimistic row shows
   *  the new ticket's key/title/color immediately instead of the old one's
   *  until refetch. */
  display?: { key: string; title: string; type: string; status: string };
}

/**
 * Server state for the week calendar: the current developer's positioned blocks
 * for one week, plus optimistic create/move/resize/delete mutations. Reads/writes
 * the ['timeBlocks', weekStartISO] cache and follows the repo's cross-cutting
 * rule — block mutations invalidate ['workItems'] and ['myTasks'] too, since
 * they change a ticket's logged/remaining hours.
 */
export function useWeekBlocks(weekStart: Date, employeeId?: number) {
  const queryClient = useQueryClient();
  // Wall-clock-as-UTC (Monday calendar midnight in UTC) to match blockToInterval,
  // so the backend's Mon–Fri window lines up with stored block days in any tz.
  const weekStartISO = weekStartToISO(weekStart);
  // employeeId is part of the key so an admin switching employees refetches.
  const key = useMemo(
    () => ['timeBlocks', weekStartISO, employeeId ?? 'self'] as const,
    [weekStartISO, employeeId],
  );

  // Negative ids for optimistic rows; replaced when the server response lands.
  const tempId = useRef(-1);

  const query = useQuery<WeekBlocksResponse>({
    queryKey: key,
    queryFn: () => {
      const params = new URLSearchParams({ week_start: weekStartISO });
      if (employeeId != null) params.set('employee_id', String(employeeId));
      return apiFetch<WeekBlocksResponse>(`/api/time-blocks?${params.toString()}`);
    },
  });

  const blocks = useMemo(() => query.data?.blocks ?? [], [query.data]);
  // Ticket-logged hours awaiting placement on the grid (start_time null).
  const unplaced = useMemo(() => query.data?.unplaced ?? [], [query.data]);

  const patchCache = (updater: (old: TimeBlockResponse[]) => TimeBlockResponse[]) =>
    queryClient.setQueryData<WeekBlocksResponse>(key, (old) =>
      old ? { ...old, blocks: updater(old.blocks) } : old,
    );

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['timeBlocks'] });
    queryClient.invalidateQueries({ queryKey: ['workItems'] });
    queryClient.invalidateQueries({ queryKey: ['myTasks'] });
  };

  const createMutation = useMutation({
    mutationFn: ({ workItemId, startISO, endISO }: CreateBlockArgs) => {
      const body: CreateTimeBlockRequest = {
        work_item_id: workItemId,
        start_time: startISO,
        end_time: endISO,
      };
      return apiFetch<TimeBlockResponse>('/api/time-blocks', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ['timeBlocks'] });
      const snapshot = queryClient.getQueryData<WeekBlocksResponse>(key);
      const optimistic: TimeBlockResponse = {
        id: tempId.current--,
        work_item_id: vars.workItemId,
        work_item_key: vars.display.key,
        work_item_title: vars.display.title,
        work_item_type: vars.display.type,
        work_item_status: vars.display.status,
        hours: hoursBetween(vars.startISO, vars.endISO),
        start_time: vars.startISO,
        end_time: vars.endISO,
      };
      patchCache((old) => [...old, optimistic]);
      return { snapshot };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(key, ctx.snapshot);
      toast.error(err instanceof ApiError ? err.message : 'Failed to log time block');
    },
    onSettled: invalidateAll,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, startISO, endISO, workItemId }: UpdateBlockArgs) => {
      const body: UpdateTimeBlockRequest = {
        ...(startISO ? { start_time: startISO } : {}),
        ...(endISO ? { end_time: endISO } : {}),
        ...(workItemId ? { work_item_id: workItemId } : {}),
      };
      return apiFetch<TimeBlockResponse>(`/api/time-blocks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ['timeBlocks'] });
      const snapshot = queryClient.getQueryData<WeekBlocksResponse>(key);
      // The target may be a positioned block OR an unplaced tray entry being
      // placed. Patch it and, if it now has a position, move it out of the tray
      // into blocks so the placement is reflected optimistically (not just on
      // refetch).
      queryClient.setQueryData<WeekBlocksResponse>(key, (old) => {
        if (!old) return old;
        const unplacedRows = old.unplaced ?? [];
        const inBlocks = old.blocks.find((b) => b.id === vars.id);
        const target = inBlocks ?? unplacedRows.find((b) => b.id === vars.id);
        if (!target) return old;
        const start_time = vars.startISO ?? target.start_time;
        const end_time = vars.endISO ?? target.end_time;
        const patched: TimeBlockResponse = {
          ...target,
          start_time,
          end_time,
          work_item_id: vars.workItemId ?? target.work_item_id,
          hours: start_time && end_time ? hoursBetween(start_time, end_time) : target.hours,
          // On reassign, reflect the target ticket's display fields right away.
          ...(vars.display && {
            work_item_key: vars.display.key,
            work_item_title: vars.display.title,
            work_item_type: vars.display.type,
            work_item_status: vars.display.status,
          }),
        };
        const positioned = Boolean(start_time && end_time);
        return {
          ...old,
          blocks: inBlocks
            ? old.blocks.map((b) => (b.id === vars.id ? patched : b))
            : positioned
              ? [...old.blocks, patched]
              : old.blocks,
          unplaced: unplacedRows.filter((b) => !(b.id === vars.id && positioned)),
        };
      });
      return { snapshot };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(key, ctx.snapshot);
      toast.error(err instanceof ApiError ? err.message : 'Failed to update time block');
    },
    onSettled: invalidateAll,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/time-blocks/${id}`, { method: 'DELETE' }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['timeBlocks'] });
      const snapshot = queryClient.getQueryData<WeekBlocksResponse>(key);
      patchCache((old) => old.filter((b) => b.id !== id));
      return { snapshot };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(key, ctx.snapshot);
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete time block');
    },
    onSettled: invalidateAll,
  });

  return {
    blocks,
    unplaced,
    isLoading: query.isLoading,
    isError: query.isError,
    createBlock: createMutation.mutate,
    updateBlock: updateMutation.mutate,
    // Placing a tray entry is just a position PATCH on its existing row — same
    // mutation as move/resize, so it never creates a new row (no double count).
    placeBlock: updateMutation.mutate,
    deleteBlock: deleteMutation.mutate,
  };
}
