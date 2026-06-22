import { beforeEach } from 'vitest';
import { setMockAuthState, type MockAuthState } from './authMocks';

/**
 * Opt-in helper for a suite that needs an explicit signed-in slate (or a
 * specific capability set / user). Call at the top of a `describe`:
 *
 *   setupAuthenticatedTest();                          // explicit signed-in admin
 *   setupAuthenticatedTest({ grantedCapabilities: [] }); // signed in, no caps
 *
 * The global afterEach (src/setupTests.ts) resets auth to the default slate, so
 * this re-applies the override before each test in the suite.
 */
export function setupAuthenticatedTest(override: Partial<MockAuthState> = {}): void {
  beforeEach(() => {
    setMockAuthState({ isAuthenticated: true, ...override });
  });
}
