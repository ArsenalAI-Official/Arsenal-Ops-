// Work-item + sprint handlers. Specific routes (/move-sprint, /log-hours,
// /sprints/*) are registered BEFORE the generic /workitems/:id so MSW matches
// them first. Mutation acks return minimal valid JSON — these endpoints back
// optimistic mutations whose cache logic lives client-side, so tests assert the
// cache/invalidation behavior, not the response body. Inject failures per-test
// with server.use(...).
import { http, HttpResponse } from 'msw';
import type { SlimWorkItem } from '@/client';
import { workItemStore } from '../data/workitems';
import { API_BASE } from './constants';

function createdItem(id: string): SlimWorkItem {
  return {
    id,
    key: `TP-${id}`,
    title: 'New item',
    status: 'todo',
    type: 'task',
    priority: 'medium',
    story_points: 0,
    tags: [],
  };
}

export const workItemHandlers = [
  // ── reads ──
  http.get(`${API_BASE}/workitems/board`, () => HttpResponse.json(workItemStore.board())),

  // ── sprints (specific prefix; before /workitems/:id) ──
  http.get(`${API_BASE}/workitems/projects/:projectId/sprints`, () => HttpResponse.json([])),
  http.post(`${API_BASE}/workitems/sprints/`, () => HttpResponse.json({ id: 99 })),
  http.put(`${API_BASE}/workitems/sprints/:sprintId/complete`, () => HttpResponse.json({})),
  http.put(`${API_BASE}/workitems/sprints/:sprintId`, () => HttpResponse.json({})),
  http.delete(
    `${API_BASE}/workitems/sprints/:sprintId`,
    () => new HttpResponse(null, { status: 204 }),
  ),

  // ── per-item specific verbs (before /workitems/:id) ──
  http.put(`${API_BASE}/workitems/:id/move-sprint`, () => HttpResponse.json({})),
  http.post(`${API_BASE}/workitems/:id/log-hours`, () =>
    HttpResponse.json({ logged_hours: 2, remaining_hours: 0 }),
  ),

  // ── work-item CRUD ──
  http.post(`${API_BASE}/workitems/`, () => HttpResponse.json(createdItem('w99'))),
  http.put(`${API_BASE}/workitems/:id`, () => HttpResponse.json({})),
  http.delete(`${API_BASE}/workitems/:id`, () => new HttpResponse(null, { status: 204 })),
];
