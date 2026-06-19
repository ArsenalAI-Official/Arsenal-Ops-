// Aggregate reset for every in-memory store. The seam that lets a test do
// `POST /x` then `GET /x` and see its own write, while the next test starts
// clean (docs/frontend-testing-guide.md §2).
//
// RULE: every new data/<domain>.ts must register its resetXStore() here. A
// forgotten reset is the classic cross-test-leak bug — guarded by
// src/mocks/mockReset.test.ts.
import { resetAuthStore } from './auth';
import { resetProjectStore } from './projects';
import { resetWorkItemStore } from './workitems';

export function resetMockData(): void {
  resetAuthStore();
  resetProjectStore();
  resetWorkItemStore();
}
