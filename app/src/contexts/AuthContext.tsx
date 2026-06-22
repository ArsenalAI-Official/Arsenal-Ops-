import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { API_BASE_URL } from '@/config/api';
import { matchesCapability } from '@/lib/capabilities';
import type { UserResponse } from '@/client';

// Sourced from the backend's `UserResponse` schema (generated from the FastAPI
// `/api/auth/*` response_model). `role` is a comma-separated string —
// 'admin', 'project_manager', 'developer', or 'admin,project_manager' — and is
// preserved for display only; permission checks go through `can(...)`.
type User = UserResponse;

// Legacy role-string helpers (hasRole / hasAnyRole / isAdmin /
// isProjectManager / isDeveloper) were removed in the RBAC consolidation.
// All permission decisions now go through `can(capability_key)` exposed on
// useAuth(). User.role on the JWT is preserved for backwards compatibility
// with display surfaces (e.g. the admin Users tab role badges) but MUST NOT
// drive access control. To check permissions, prefer:
//
//     const { can } = useAuth();
//     if (can('admin.projects')) { ... }
//
// See backend/capabilities.py for the registry of valid keys.

// Split into State and Actions contexts so consumers that only need to call
// actions (e.g. logout button) don't re-render when state values (capabilities,
// showWarning, user) change. Backward compat: useAuth() still returns the full
// combined shape so existing consumers don't have to migrate.
interface AuthStateContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  showWarning: boolean;
  capabilities: string[];
  can: (cap: string) => boolean;
}

interface AuthActionsContextType {
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  loginDev: () => Promise<void>;
  logout: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  checkAuth: () => Promise<void>;
  dismissWarning: () => void;
  refreshCapabilities: () => Promise<void>;
}

interface AuthContextType extends AuthStateContextType, AuthActionsContextType {}

const AuthStateContext = createContext<AuthStateContextType | undefined>(undefined);
const AuthActionsContext = createContext<AuthActionsContextType | undefined>(undefined);

// 24 hours in milliseconds
const IDLE_TIMEOUT = 24 * 60 * 60 * 1000;
const WARNING_TIME = 23 * 60 * 60 * 1000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    // Try to restore user from localStorage on mount
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        return JSON.parse(savedUser);
      } catch {
        return null;
      }
    }
    return null;
  });
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(!!token); // Only loading if we have a token
  const [showWarning, setShowWarning] = useState(false);
  const [capabilities, setCapabilities] = useState<string[]>(() => {
    // Restore from localStorage so UI doesn't flash unauthorized on reload.
    const saved = localStorage.getItem('capabilities');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  const lastActivityRef = useRef(Date.now());
  // Mirrors `showWarning` so `updateActivity` can read it in O(1) without
  // re-subscribing the event listeners every time the state changes.
  const showWarningRef = useRef(false);
  const isAuthenticated = !!user && !!token;

  // Fetch + cache the user's effective capabilities. Keeps stale cache on
  // failure so a transient backend hiccup doesn't wipe every gated UI.
  const fetchCapabilitiesWith = useCallback(async (currentToken: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/me/capabilities`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        const caps: string[] = Array.isArray(data?.capabilities) ? data.capabilities : [];
        setCapabilities(caps);
        localStorage.setItem('capabilities', JSON.stringify(caps));
      }
    } catch {
      // keep stale cache on network error
    }
  }, []);

  const refreshCapabilities = useCallback(async () => {
    const currentToken = token || localStorage.getItem('token');
    if (currentToken) await fetchCapabilitiesWith(currentToken);
  }, [token, fetchCapabilitiesWith]);

  const can = useCallback((cap: string) => matchesCapability(cap, capabilities), [capabilities]);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    showWarningRef.current = false;
    setShowWarning(false);
    setCapabilities([]);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('capabilities');
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const currentToken = token || localStorage.getItem('token');
      if (!currentToken) {
        setIsLoading(false);
        return;
      }

      // Fire /me and /me/capabilities in parallel. The capabilities call
      // doesn't depend on /me succeeding — the backend authenticates each
      // call from the bearer token directly. Doing them together saves one
      // serial network round-trip on every page load.
      const [meResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${currentToken}` },
        }),
        fetchCapabilitiesWith(currentToken),
      ]);

      if (meResponse.ok) {
        const userData = await meResponse.json();
        setUser(userData);
        if (!token) {
          setToken(currentToken);
        }
      } else {
        // Token invalid, clear it
        logout();
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      logout();
    } finally {
      setIsLoading(false);
    }
  }, [token, logout, fetchCapabilitiesWith]);

  // Check authentication on mount only. checkAuth is intentionally excluded
  // from deps — we re-validate on token change via the regular login flow,
  // not by re-running this effect.
  useEffect(() => {
    if (token) {
      checkAuth();
    } else {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Activity tracking
  useEffect(() => {
    if (!isAuthenticated) return;

    const updateActivity = () => {
      lastActivityRef.current = Date.now();
      // No-op guard. mousedown/keydown/touchstart can fire several times per
      // second; without this, every event would re-render AuthProvider and
      // every useAuth() consumer. Only set state when the warning is up.
      if (showWarningRef.current) {
        showWarningRef.current = false;
        setShowWarning(false);
      }
    };

    // `mousemove` is excluded (60Hz noise; cursor motion is not engagement).
    // `scroll` is also excluded — it fires continuously during a scroll
    // gesture and adds nothing meaningful: the click/key/touch that
    // initiated the scroll already counted as activity, and a user who is
    // *only* scrolling (no clicks/keys/touch) for 23+ hours is exactly the
    // idle-warning case the timeout is meant to catch.
    const events = ['mousedown', 'keydown', 'touchstart'];
    events.forEach((event) => {
      document.addEventListener(event, updateActivity, true);
    });

    const interval = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= IDLE_TIMEOUT) {
        logout();
      } else if (idle >= WARNING_TIME && !showWarningRef.current) {
        showWarningRef.current = true;
        setShowWarning(true);
      }
    }, 60000);

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, updateActivity, true);
      });
      clearInterval(interval);
    };
  }, [isAuthenticated, logout]);

  // Keep capability list fresh while the user is signed in. Without this, a
  // developer who was logged in before an admin edits their role keeps the
  // old cap list in localStorage until they hard-refresh or re-login —
  // `can('project.create')` then stays false even though the backend would
  // accept the call.
  //
  // Two triggers:
  //  • `visibilitychange` → instant refresh when the tab regains focus
  //    (covers the "admin tells user, user switches back" case).
  //  • 60s interval → safety net for actively-used sessions that never lose
  //    focus. Matches the backend `_caps_cache` TTL, so the frontend can't
  //    be more stale than the backend itself.
  useEffect(() => {
    if (!isAuthenticated) return;

    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshCapabilities();
    };
    document.addEventListener('visibilitychange', onVisible);

    const interval = setInterval(refreshCapabilities, 60000);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
    };
  }, [isAuthenticated, refreshCapabilities]);

  const dismissWarning = useCallback(() => {
    showWarningRef.current = false;
    setShowWarning(false);
    lastActivityRef.current = Date.now();
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);

      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Login failed');
      }

      const data = await response.json();
      setToken(data.access_token);
      setUser(data.user);
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      lastActivityRef.current = Date.now();
      fetchCapabilitiesWith(data.access_token);
    },
    [fetchCapabilitiesWith],
  );

  const loginWithGoogle = useCallback(
    async (idToken: string) => {
      const response = await fetch(`${API_BASE_URL}/api/auth/google-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: idToken }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Google login failed');
      }

      const data = await response.json();
      setToken(data.access_token);
      setUser(data.user);
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      lastActivityRef.current = Date.now();
      fetchCapabilitiesWith(data.access_token);
    },
    [fetchCapabilitiesWith],
  );

  const loginDev = useCallback(async () => {
    const response = await fetch(`${API_BASE_URL}/api/auth/dev-login`, { method: 'POST' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Dev login unavailable (set DEV_AUTH_BYPASS=1 on backend)');
    }
    const data = await response.json();
    setToken(data.access_token);
    setUser(data.user);
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('user', JSON.stringify(data.user));
    lastActivityRef.current = Date.now();
    fetchCapabilitiesWith(data.access_token);
  }, [fetchCapabilitiesWith]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to change password');
      }

      // Update user state to reflect password changed
      setUser((prev) => (prev ? { ...prev, is_first_login: false } : null));
    },
    [token],
  );

  const stateValue = useMemo<AuthStateContextType>(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated,
      showWarning,
      capabilities,
      can,
    }),
    [user, token, isLoading, isAuthenticated, showWarning, capabilities, can],
  );

  const actionsValue = useMemo<AuthActionsContextType>(
    () => ({
      login,
      loginWithGoogle,
      loginDev,
      logout,
      changePassword,
      checkAuth,
      dismissWarning,
      refreshCapabilities,
    }),
    [
      login,
      loginWithGoogle,
      loginDev,
      logout,
      changePassword,
      checkAuth,
      dismissWarning,
      refreshCapabilities,
    ],
  );

  return (
    <AuthActionsContext.Provider value={actionsValue}>
      <AuthStateContext.Provider value={stateValue}>{children}</AuthStateContext.Provider>
    </AuthActionsContext.Provider>
  );
}

export function useAuthState(): AuthStateContextType {
  const ctx = useContext(AuthStateContext);
  if (ctx === undefined) {
    throw new Error('useAuthState must be used within an AuthProvider');
  }
  return ctx;
}

export function useAuthActions(): AuthActionsContextType {
  const ctx = useContext(AuthActionsContext);
  if (ctx === undefined) {
    throw new Error('useAuthActions must be used within an AuthProvider');
  }
  return ctx;
}

// Backward-compat hook: combines state + actions so existing consumers keep
// working unchanged. New code should prefer useAuthState() / useAuthActions().
export function useAuth(): AuthContextType {
  const state = useAuthState();
  const actions = useAuthActions();
  // Stable when both halves are stable, which is the normal case since each
  // provider memoizes its value.
  return useMemo(() => ({ ...state, ...actions }), [state, actions]);
}
