// MSW handlers for the calendar time-blocks API. Backs both dev-mode and tests
// with a small in-memory store, reset between tests via resetTimeBlocks().
import { http, HttpResponse } from 'msw';
import type { CreateTimeBlockRequest, TimeBlockResponse, UpdateTimeBlockRequest } from '@/client';
import { API_BASE } from './constants';

const hoursBetween = (startISO: string, endISO: string): number =>
  Number(((new Date(endISO).getTime() - new Date(startISO).getTime()) / 3_600_000).toFixed(2));

let blocks: TimeBlockResponse[] = [];
let nextId = 1;

export function resetTimeBlocks(): void {
  blocks = [];
  nextId = 1;
}

/** Seed blocks for a test. */
export function seedTimeBlocks(seed: TimeBlockResponse[]): void {
  blocks = [...seed];
  nextId = Math.max(0, ...seed.map((b) => b.id)) + 1;
}

export const timeBlockHandlers = [
  http.get(`${API_BASE}/time-blocks`, ({ request }) => {
    const url = new URL(request.url);
    const weekStart = new Date(url.searchParams.get('week_start') ?? new Date().toISOString());
    // Mon–Fri (5-day) window, matching the real endpoint + the rendered grid.
    const weekEnd = new Date(weekStart.getTime() + 5 * 86_400_000);
    const inWeek = blocks.filter((b) => {
      if (!b.start_time) return false;
      const t = new Date(b.start_time);
      return t >= weekStart && t < weekEnd;
    });
    return HttpResponse.json({
      week_start: weekStart.toISOString(),
      week_end: weekEnd.toISOString(),
      blocks: inWeek,
    });
  }),

  http.post(`${API_BASE}/time-blocks`, async ({ request }) => {
    const body = (await request.json()) as CreateTimeBlockRequest;
    const block: TimeBlockResponse = {
      id: nextId++,
      work_item_id: body.work_item_id,
      work_item_key: `ARS-${body.work_item_id}`,
      work_item_title: 'Mock ticket',
      work_item_type: 'task',
      work_item_status: 'in_progress',
      hours: hoursBetween(body.start_time, body.end_time),
      description: body.description ?? null,
      start_time: body.start_time,
      end_time: body.end_time,
    };
    blocks.push(block);
    return HttpResponse.json(block, { status: 201 });
  }),

  http.patch(`${API_BASE}/time-blocks/:id`, async ({ params, request }) => {
    const id = Number(params.id);
    const body = (await request.json()) as UpdateTimeBlockRequest;
    const block = blocks.find((b) => b.id === id);
    if (!block) return HttpResponse.json({ detail: 'Time block not found' }, { status: 404 });
    if (body.start_time) block.start_time = body.start_time;
    if (body.end_time) block.end_time = body.end_time;
    if (body.work_item_id) {
      block.work_item_id = body.work_item_id;
      block.work_item_key = `ARS-${body.work_item_id}`;
    }
    if (block.start_time && block.end_time) {
      block.hours = hoursBetween(block.start_time, block.end_time);
    }
    return HttpResponse.json(block);
  }),

  http.delete(`${API_BASE}/time-blocks/:id`, ({ params }) => {
    const id = Number(params.id);
    blocks = blocks.filter((b) => b.id !== id);
    return new HttpResponse(null, { status: 204 });
  }),
];
