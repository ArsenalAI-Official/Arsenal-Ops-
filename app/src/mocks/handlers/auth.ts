// MSW handlers for the auth surface the app hits on mount: the current user
// (/api/auth/me) and capability list (/api/auth/capabilities). Edge cases (401,
// etc.) are injected per-test with server.use(...), never by mutating these.
import { http, HttpResponse } from 'msw';
import { API_BASE } from './constants';
import { authStore } from '../data/auth';

export const authHandlers = [
  http.get(`${API_BASE}/auth/me`, () => HttpResponse.json(authStore.getUser())),

  http.get(`${API_BASE}/auth/capabilities`, () => HttpResponse.json(authStore.getCapabilities())),
];
