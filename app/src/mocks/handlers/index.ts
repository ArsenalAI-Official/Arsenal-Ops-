// Composes every domain's handlers into the array MSW listens with, and
// exposes one resetMockStore() the test lifecycle calls in afterEach.
//
// Add a new domain by importing its handlers here and (if it owns state)
// registering its store reset in ../data/index.ts.
import { resetMockData } from '../data';
import { adminHandlers } from './admin';
import { authHandlers } from './auth';
import { commentHandlers } from './comments';
import { developerHandlers } from './developers';
import { projectHandlers } from './projects';
import { workItemHandlers } from './workitems';

export const handlers = [
  ...authHandlers,
  ...projectHandlers,
  ...workItemHandlers,
  ...developerHandlers,
  ...commentHandlers,
  ...adminHandlers,
];

export function resetMockStore(): void {
  resetMockData();
}
