import { QueryClient } from '@tanstack/react-query';

// A QueryClient tuned for tests. `retry: false` makes error paths resolve
// immediately instead of after multi-second backoff; `gcTime: 0` ensures no
// cached data survives into the next test. This pairing is the main defense
// against query-cache leakage and slow error tests
// (docs/frontend-testing-guide.md §4).
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}
