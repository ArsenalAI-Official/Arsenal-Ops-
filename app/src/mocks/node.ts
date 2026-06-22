// The MSW server instance for the Node/jsdom test runner, plus the one-call
// state reset the lifecycle hooks use. The app's hand-rolled apiFetch uses the
// global fetch, which msw/node patches — so handlers intercept the real request
// pipeline (headers, ApiError mapping, 204 handling) unchanged.
import { setupServer } from 'msw/node';
import { handlers, resetMockStore } from './handlers';

export const server = setupServer(...handlers);

/** Reset all in-memory backend state to its seed. Called every afterEach. */
export function resetMockServerState(): void {
  resetMockStore();
}
