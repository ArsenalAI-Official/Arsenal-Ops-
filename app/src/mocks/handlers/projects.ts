// Project read handlers. GET /api/projects/:id backs the board's project query
// (and the admin members panel). Edge cases via server.use(...) per test.
import { http, HttpResponse } from 'msw';
import { API_BASE } from './constants';
import { projectStore } from '../data/projects';

export const projectHandlers = [
  http.get(`${API_BASE}/projects/:id`, () => HttpResponse.json(projectStore.get())),
];
