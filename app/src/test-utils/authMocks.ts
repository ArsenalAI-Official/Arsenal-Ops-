// Hoisted mock state for `@/contexts/AuthContext`.
//
// The real provider talks to the backend (login, /me, capability refresh) and
// wires idle-timeout effects. Tests don't want any of that — they want a
// deterministic, overridable auth state. So we replace the module at the
// boundary (see src/setupTests.ts) with these mock fns.
//
// Why hoisted: `vi.mock` is hoisted above imports, so its factory runs before
// this module would normally be evaluated. `vi.hoisted` guarantees the mock fns
// exist by the time the factory references them.
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import type { UserResponse } from '@/client';

export interface MockAuthState {
  user: UserResponse | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  showWarning: boolean;
  capabilities: string[];
  /** Capabilities granted to `can()`. `'*'` (default) grants everything. */
  grantedCapabilities: string[] | '*';
}

// A signed-in admin with all capabilities — the default most tests want.
const DEFAULT_USER: UserResponse = {
  id: 1,
  name: 'Test User',
  email: 'test@arsenalai.com',
  role: 'admin',
  is_first_login: false,
  is_external: false,
};

function defaultState(): MockAuthState {
  return {
    user: DEFAULT_USER,
    token: 'test-token',
    isLoading: false,
    isAuthenticated: true,
    showWarning: false,
    capabilities: [],
    grantedCapabilities: '*',
  };
}

// Mutable module-level state the hoisted hooks read from. Reset every test by
// installAuthGlobal() in the afterEach chain.
let state: MockAuthState = defaultState();

export function getMockAuthState(): MockAuthState {
  return state;
}

/** Override the current auth slate for a single test (merged into defaults). */
export function setMockAuthState(patch: Partial<MockAuthState>): void {
  state = { ...state, ...patch };
}

/** Reset auth to the default signed-in admin. Called in afterEach. */
export function resetMockAuthState(): void {
  state = defaultState();
}

function can(capability: string): boolean {
  if (state.grantedCapabilities === '*') return true;
  return state.grantedCapabilities.includes(capability);
}

// Action spies — exposed so a test can assert e.g. logout was hit. No
// vi.hoisted needed: authModuleMock() is invoked lazily when vi.mock resolves
// the module, by which point this module is fully evaluated.
export const authActionMocks = {
  login: vi.fn(async () => {}),
  loginWithGoogle: vi.fn(async () => {}),
  loginDev: vi.fn(async () => {}),
  logout: vi.fn(() => {}),
  changePassword: vi.fn(async () => {}),
  checkAuth: vi.fn(async () => {}),
  dismissWarning: vi.fn(() => {}),
  refreshCapabilities: vi.fn(async () => {}),
};

function stateValue() {
  return {
    user: state.user,
    token: state.token,
    isLoading: state.isLoading,
    isAuthenticated: state.isAuthenticated,
    showWarning: state.showWarning,
    capabilities: state.capabilities,
    can,
  };
}

/**
 * The module shape `vi.mock('@/contexts/AuthContext', ...)` installs. Mirrors
 * the real module's exports: split state/actions hooks plus the back-compat
 * combined `useAuth`, and an `AuthProvider` that is a pass-through (the mock
 * hooks don't need a real provider in the tree).
 */
export function authModuleMock() {
  return {
    useAuthState: () => stateValue(),
    useAuthActions: () => authActionMocks,
    useAuth: () => ({ ...stateValue(), ...authActionMocks }),
    AuthProvider: ({ children }: { children: ReactNode }) => children,
  };
}
