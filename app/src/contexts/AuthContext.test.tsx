// Tests for the REAL AuthContext — the single most critical file in the repo.
//
// CRITICAL: src/setupTests.ts globally does `vi.mock('@/contexts/AuthContext')`,
// replacing the real provider with a deterministic stub. To exercise the real
// code we `vi.unmock(...)` at the very top (before any import of it) so the
// factory is discarded and the actual module loads.
//
// Network is faked at the wire by MSW (handlers in src/mocks/handlers/auth.ts,
// store in src/mocks/data/auth.ts). The real provider uses global `fetch`
// against `${API_BASE_URL}/api/auth/...`, which MSW intercepts unchanged. Edge
// cases (401 login, invalid token, 400 change-password, cap-refresh error) are
// injected per-test via server.use(...). We confirm we're on the real code by
// asserting real localStorage writes happen.
import { vi } from 'vitest';

vi.unmock('@/contexts/AuthContext');

import { http, HttpResponse } from 'msw';
import { type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { API_BASE } from '@/mocks/handlers/constants';
import { server } from '@/mocks/node';
import { MOCK_ACCESS_TOKEN, authStore } from '@/mocks/data/auth';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

function renderAuth() {
  return renderHook(() => useAuth(), { wrapper });
}

// Assert an async action rejects, WITHOUT letting the rejection escape act().
// Letting a promise reject out of `await act(async () => { await reject() })`
// leaves React's act environment in a dirty state on React 19 + Node 20, which
// prevents the NEXT test's render from committing (result.current stays null).
// Catch the rejection inside act, then assert on the captured error.
async function expectActionRejects(action: Promise<unknown>, message: RegExp) {
  let caught: unknown;
  await act(async () => {
    await action.catch((err: unknown) => {
      caught = err;
    });
  });
  expect(caught).toBeInstanceOf(Error);
  expect((caught as Error).message).toMatch(message);
}

// Seed localStorage as if a prior session had been restored, WITHOUT going
// through checkAuth (used by tests that pre-hydrate before mount).
function seedSession(token: string, user: unknown, caps: string[]) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.setItem('capabilities', JSON.stringify(caps));
}

describe('AuthContext (real provider)', () => {
  // Sentinel: proves we are exercising the REAL module, not the global
  // setupTests mock. The real useAuth throws when used outside an AuthProvider;
  // the mock's context-free hooks do not. If a future shared import re-caches
  // AuthContext and defeats the top-of-file vi.unmock, this fails loudly instead
  // of every test below silently passing against the stub.
  it('sentinel: real useAuth() throws outside an AuthProvider (mock would not)', () => {
    expect(() => renderHook(() => useAuth())).toThrow(/must be used within an AuthProvider/);
  });

  describe('login(email, password)', () => {
    it('on success sets token+user, writes localStorage, and fetches capabilities', async () => {
      const { result } = renderAuth();
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.login('test@arsenalai.com', 'pw');
      });

      expect(result.current.token).toBe(MOCK_ACCESS_TOKEN);
      expect(result.current.user?.email).toBe('test@arsenalai.com');
      expect(result.current.isAuthenticated).toBe(true);
      // Real localStorage writes — proves we're exercising the real module.
      expect(localStorage.getItem('token')).toBe(MOCK_ACCESS_TOKEN);
      expect(JSON.parse(localStorage.getItem('user') ?? 'null')?.email).toBe('test@arsenalai.com');

      // Capabilities fetched from /me/capabilities (fired inside login).
      await waitFor(() => expect(result.current.can('projects.view')).toBe(true));
      expect(JSON.parse(localStorage.getItem('capabilities') ?? '[]')).toContain('projects.view');
    });

    it('throws with the server detail on 401', async () => {
      server.use(
        http.post(`${API_BASE}/auth/login`, () =>
          HttpResponse.json({ detail: 'Invalid email or password' }, { status: 401 }),
        ),
      );
      const { result } = renderAuth();
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await expectActionRejects(
        result.current.login('bad@arsenalai.com', 'wrong'),
        /Invalid email or password/,
      );

      expect(result.current.isAuthenticated).toBe(false);
      expect(localStorage.getItem('token')).toBeNull();
    });
  });

  describe('loginWithGoogle / loginDev', () => {
    it('loginWithGoogle success sets token+user+localStorage', async () => {
      const { result } = renderAuth();
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.loginWithGoogle('google-id-token');
      });

      expect(result.current.token).toBe(MOCK_ACCESS_TOKEN);
      expect(result.current.isAuthenticated).toBe(true);
      expect(localStorage.getItem('token')).toBe(MOCK_ACCESS_TOKEN);
      expect(JSON.parse(localStorage.getItem('user') ?? 'null')?.email).toBe('test@arsenalai.com');
    });

    it('loginDev success sets token+user+localStorage', async () => {
      const { result } = renderAuth();
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.loginDev();
      });

      expect(result.current.token).toBe(MOCK_ACCESS_TOKEN);
      expect(result.current.isAuthenticated).toBe(true);
      expect(localStorage.getItem('token')).toBe(MOCK_ACCESS_TOKEN);
    });
  });

  describe('logout()', () => {
    it('clears user/token/capabilities state and removes all three localStorage keys', async () => {
      const { result } = renderAuth();
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.login('test@arsenalai.com', 'pw');
      });
      await waitFor(() => expect(result.current.can('projects.view')).toBe(true));
      expect(localStorage.getItem('token')).toBe(MOCK_ACCESS_TOKEN);

      act(() => {
        result.current.logout();
      });

      expect(result.current.user).toBeNull();
      expect(result.current.token).toBeNull();
      expect(result.current.capabilities).toEqual([]);
      expect(result.current.isAuthenticated).toBe(false);
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
      expect(localStorage.getItem('capabilities')).toBeNull();
    });
  });

  describe('restore-on-mount from localStorage', () => {
    it('hydrates user + token + capabilities from localStorage', async () => {
      seedSession(
        'restored-token',
        { id: 7, name: 'Restored', email: 'r@arsenalai.com', role: 'admin', is_first_login: false },
        ['projects.view'],
      );
      // /me + /me/capabilities are called on mount (valid token). Keep them
      // resolving so checkAuth doesn't log out; it overwrites user from /me.
      const { result } = renderAuth();

      // Initial hydration is synchronous from localStorage before any fetch.
      expect(result.current.token).toBe('restored-token');
      expect(result.current.capabilities).toEqual(['projects.view']);

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      // After checkAuth, user comes from /me (the seeded mock user).
      expect(result.current.user?.email).toBe('test@arsenalai.com');
    });

    it('falls back to null/[] on malformed JSON without throwing', async () => {
      localStorage.setItem('user', '{not valid json');
      localStorage.setItem('capabilities', 'also-not-json');
      // No token → checkAuth short-circuits, no network.
      const { result } = renderAuth();

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.user).toBeNull();
      expect(result.current.capabilities).toEqual([]);
    });
  });

  describe('checkAuth on mount', () => {
    it('with a valid token sets user from /me and ends isLoading false', async () => {
      seedSession(
        'valid-token',
        {
          id: 1,
          name: 'Stale',
          email: 'stale@arsenalai.com',
          role: 'admin',
          is_first_login: false,
        },
        [],
      );
      const { result } = renderAuth();

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.user?.email).toBe('test@arsenalai.com'); // from /me
      expect(result.current.isAuthenticated).toBe(true);
    });

    it('with an invalid token (/me 401) logs out and clears state', async () => {
      server.use(
        http.get(`${API_BASE}/auth/me`, () =>
          HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 }),
        ),
        // capabilities call also fires in parallel; keep it resolvable.
        http.get(`${API_BASE}/auth/me/capabilities`, () =>
          HttpResponse.json({ roles: [], capabilities: [] }),
        ),
      );
      seedSession(
        'invalid-token',
        { id: 1, name: 'X', email: 'x@arsenalai.com', role: 'admin', is_first_login: false },
        ['projects.view'],
      );
      const { result } = renderAuth();

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.user).toBeNull();
      expect(result.current.token).toBeNull();
      expect(localStorage.getItem('token')).toBeNull();
    });

    it('a fetch throw on /me triggers logout and ends isLoading false', async () => {
      server.use(
        http.get(`${API_BASE}/auth/me`, () => HttpResponse.error()),
        http.get(`${API_BASE}/auth/me/capabilities`, () =>
          HttpResponse.json({ roles: [], capabilities: [] }),
        ),
      );
      seedSession(
        'boom-token',
        { id: 1, name: 'X', email: 'x@arsenalai.com', role: 'admin', is_first_login: false },
        [],
      );
      const { result } = renderAuth();

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.user).toBeNull();
      expect(result.current.token).toBeNull();
    });

    it('with no token ends isLoading false and stays unauthenticated', async () => {
      const { result } = renderAuth();
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe('capabilities', () => {
    it('can(cap) reflects fetched caps via matchesCapability (incl. prefix)', async () => {
      authStore.setCapabilities(['projects.*']);
      const { result } = renderAuth();
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.login('test@arsenalai.com', 'pw');
      });

      await waitFor(() => expect(result.current.can('projects.view')).toBe(true));
      expect(result.current.can('projects.anything.nested')).toBe(true);
      expect(result.current.can('admin.view')).toBe(false);
    });

    it('refreshCapabilities keeps the stale cache when /me/capabilities errors', async () => {
      const { result } = renderAuth();
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.login('test@arsenalai.com', 'pw');
      });
      await waitFor(() => expect(result.current.can('projects.view')).toBe(true));
      const before = result.current.capabilities;

      // Now make the caps endpoint fail; refresh must NOT wipe the cache.
      server.use(
        http.get(`${API_BASE}/auth/me/capabilities`, () =>
          HttpResponse.json({ detail: 'boom' }, { status: 500 }),
        ),
      );
      await act(async () => {
        await result.current.refreshCapabilities();
      });

      expect(result.current.capabilities).toEqual(before);
      expect(result.current.can('projects.view')).toBe(true);
    });
  });

  describe('changePassword', () => {
    it('on success sets user.is_first_login = false', async () => {
      authStore.setUser({
        id: 1,
        name: 'First Login',
        email: 'first@arsenalai.com',
        role: 'admin',
        is_first_login: true,
      });
      const { result } = renderAuth();
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.login('first@arsenalai.com', 'pw');
      });
      expect(result.current.user?.is_first_login).toBe(true);

      await act(async () => {
        await result.current.changePassword('old', 'new');
      });

      expect(result.current.user?.is_first_login).toBe(false);
    });

    it('throws with the server detail on 400', async () => {
      server.use(
        http.post(`${API_BASE}/auth/change-password`, () =>
          HttpResponse.json({ detail: 'Current password is incorrect' }, { status: 400 }),
        ),
      );
      const { result } = renderAuth();
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.login('test@arsenalai.com', 'pw');
      });

      await expectActionRejects(
        result.current.changePassword('wrong', 'new'),
        /Current password is incorrect/,
      );
    });
  });

  describe('idle timeout / warning', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    async function loginWithFakeTimers(result: { current: ReturnType<typeof useAuth> }) {
      await act(async () => {
        await result.current.login('test@arsenalai.com', 'pw');
        // Let the login fetch + the fire-and-forget caps fetch settle under
        // fake timers (advanceTimers below drives their microtasks).
        await vi.advanceTimersByTimeAsync(0);
      });
    }

    it('advancing past WARNING_TIME sets showWarning=true', async () => {
      const { result } = renderAuth();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      await loginWithFakeTimers(result);
      expect(result.current.showWarning).toBe(false);

      // 23h < idle < 24h → warning, not logout. The activity check runs on a
      // 60s interval, so advance just past WARNING_TIME (23h).
      await act(async () => {
        await vi.advanceTimersByTimeAsync(23 * 60 * 60 * 1000 + 60000);
      });

      expect(result.current.showWarning).toBe(true);
      expect(result.current.isAuthenticated).toBe(true);
    });

    it('advancing past IDLE_TIMEOUT auto-logs-out', async () => {
      const { result } = renderAuth();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      await loginWithFakeTimers(result);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000 + 60000);
      });

      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });

    it('a user-activity event resets showWarning', async () => {
      const { result } = renderAuth();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      await loginWithFakeTimers(result);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(23 * 60 * 60 * 1000 + 60000);
      });
      expect(result.current.showWarning).toBe(true);

      act(() => {
        document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      });

      expect(result.current.showWarning).toBe(false);
      expect(result.current.isAuthenticated).toBe(true);
    });
  });
});
