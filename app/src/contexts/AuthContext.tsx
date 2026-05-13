import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { API_BASE_URL } from '@/config/api';

interface User {
  id: number;
  email: string;
  name: string;
  role: string;  // Comma-separated roles: 'admin', 'project_manager', 'developer', or 'admin,project_manager'
  is_first_login: boolean;
}

// Helper functions for role checking
export const hasRole = (userRole: string | undefined, requiredRole: string): boolean => {
  if (!userRole) return false;
  const roles = userRole.split(',').map(r => r.trim());
  return roles.includes(requiredRole);
};

export const hasAnyRole = (userRole: string | undefined, requiredRoles: string[]): boolean => {
  if (!userRole) return false;
  const roles = userRole.split(',').map(r => r.trim());
  return requiredRoles.some(role => roles.includes(role));
};

export const isAdmin = (user: User | null): boolean => hasRole(user?.role, 'admin');
export const isProjectManager = (user: User | null): boolean => hasAnyRole(user?.role, ['admin', 'project_manager']);
export const isDeveloper = (user: User | null): boolean => hasRole(user?.role, 'developer');

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  checkAuth: () => Promise<void>;
  showWarning: boolean;
  dismissWarning: () => void;
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

  const lastActivityRef = useRef(Date.now());
  // Mirrors `showWarning` so `updateActivity` can read it in O(1) without
  // re-subscribing the event listeners every time the state changes.
  const showWarningRef = useRef(false);
  const isAuthenticated = !!user && !!token;

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    showWarningRef.current = false;
    setShowWarning(false);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
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
          'Authorization': `Bearer ${currentToken}`,
        },
      });

      if (response.ok) {
        const userData = await response.json();
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
  }, [token, logout]);

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
      // No-op guard. mousedown/keydown/touchstart/scroll can fire many times
      // per second; without this, every event would re-render AuthProvider
      // and every useAuth() consumer in the app. We only need to update
      // state when the warning is actually showing.
      if (showWarningRef.current) {
        showWarningRef.current = false;
        setShowWarning(false);
      }
    };

    // `mousemove` deliberately excluded — fires at ~60Hz and mouse motion
    // does not need to extend a session (clicks/keys/touch do). Including it
    // caused AuthProvider to re-render on every pixel of cursor movement.
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
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

  const login = useCallback(async (email: string, password: string) => {
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
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
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
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
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
      logout,
      changePassword,
      checkAuth,
      showWarning,
      dismissWarning,
    }),
    [
      user,
      token,
      isLoading,
      isAuthenticated,
      showWarning,
      login,
      loginWithGoogle,
      logout,
      changePassword,
      checkAuth,
      dismissWarning,
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
