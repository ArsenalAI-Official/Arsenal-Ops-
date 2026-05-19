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

interface User {
  id: number;
  email: string;
  name: string;
  role: string; // Comma-separated roles: 'admin', 'project_manager', 'developer', or 'admin,project_manager'
  is_first_login: boolean;
}

// Helper functions for role checking
export const hasRole = (userRole: string | undefined, requiredRole: string): boolean => {
  if (!userRole) return false;
  const roles = userRole.split(',').map((r) => r.trim());
  return roles.includes(requiredRole);
};

export const hasAnyRole = (userRole: string | undefined, requiredRoles: string[]): boolean => {
  if (!userRole) return false;
  const roles = userRole.split(',').map((r) => r.trim());
  return requiredRoles.some((role) => roles.includes(role));
};

export const isAdmin = (user: User | null): boolean => hasRole(user?.role, 'admin');
export const isProjectManager = (user: User | null): boolean =>
  hasAnyRole(user?.role, ['admin', 'project_manager']);
export const isDeveloper = (user: User | null): boolean => hasRole(user?.role, 'developer');

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  loginDev: () => Promise<void>;
  logout: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  checkAuth: () => Promise<void>;
  showWarning: boolean;
  dismissWarning: () => void;
  // RBAC capabilities
  capabilities: string[];
  can: (cap: string) => boolean;
  refreshCapabilities: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${currentToken}`,
        },
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        if (!token) {
          setToken(currentToken);
        }
        // Refresh capabilities alongside user so the two stay in sync.
        fetchCapabilitiesWith(currentToken);
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

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated,
      login,
      loginWithGoogle,
      loginDev,
      logout,
      changePassword,
      checkAuth,
      showWarning,
      dismissWarning,
      capabilities,
      can,
      refreshCapabilities,
    }),
    [
      user,
      token,
      isLoading,
      isAuthenticated,
      showWarning,
      login,
      loginWithGoogle,
      loginDev,
      logout,
      changePassword,
      checkAuth,
      dismissWarning,
      capabilities,
      can,
      refreshCapabilities,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
