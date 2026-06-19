// Developer read handler. The board + reviewer panel fetch GET /api/developers/.
// Empty by default — domains that only ever need an empty list don't carry a
// store; a test that needs developers overrides with server.use(...).
import { http, HttpResponse } from 'msw';
import type { DeveloperResponse } from '@/client';
import { API_BASE } from './constants';

const NO_DEVELOPERS: DeveloperResponse[] = [];

export const developerHandlers = [
  http.get(`${API_BASE}/developers/`, () => HttpResponse.json(NO_DEVELOPERS)),
];
