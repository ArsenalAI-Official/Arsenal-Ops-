import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { API_BASE_URL } from '@/config/api';
import { matchesCapability } from '@/lib/capabilities';

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
  idleTime: number;
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
  const [idleTime, setIdleTime] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const [capabilities, setCapabilities] = useState<string[]>(() => {
    // Restore from localStorage so UI doesn't flash unauthorized on reload
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
  const isAuthenticated = !!user && !!token;

  // Check authentication on mount and when token changes
  useEffect(() => {
    // If there's a token in localStorage, validate it
    if (token) {
      checkAuth();
    } else {
      setIsLoading(false);
    }
  }, []);

  // Activity tracking
  useEffect(() => {
    if (!isAuthenticated) return;

    const updateActivity = () => {
      lastActivityRef.current = Date.now();
      setIdleTime(0);
      setShowWarning(false);
    };

    // Track user activity
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'];
    events.forEach(event => {
      document.addEventListener(event, updateActivity, true);
    });

    // Check idle time every minute
    const interval = setInterval(() => {
      const now = Date.now();
      const idle = now - lastActivityRef.current;
      setIdleTime(idle);

      if (idle >= IDLE_TIMEOUT) {
        // Auto logout after 30 minutes
        logout();
      } else if (idle >= WARNING_TIME) {
        // Show warning at 25 minutes
        setShowWarning(true);
      }
    }, 60000); // Check every minute

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity, true);
      });
      clearInterval(interval);
    };
  }, [isAuthenticated]);

  const dismissWarning = () => {
    setShowWarning(false);
    lastActivityRef.current = Date.now();
    setIdleTime(0);
  };

  const fetchCapabilitiesWith = async (currentToken: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/me/capabilities`, {
        headers: { 'Authorization': `Bearer ${currentToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        const caps: string[] = Array.isArray(data?.capabilities) ? data.capabilities : [];
        setCapabilities(caps);
        localStorage.setItem('capabilities', JSON.stringify(caps));
      }
      // On non-ok, intentionally keep the previously cached set — better than wiping
      // every gated UI on a transient backend hiccup.
    } catch {
      // same: keep stale cache on network error
    }
  };

  const refreshCapabilities = async () => {
    const currentToken = token || localStorage.getItem('token');
    if (currentToken) await fetchCapabilitiesWith(currentToken);
  };

  const can = useCallback(
    (cap: string) => matchesCapability(cap, capabilities),
    [capabilities],
  );

  const checkAuth = async () => {
    try {
      const currentToken = token || localStorage.getItem('token');
      if (!currentToken) {
        setIsLoading(false);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${currentToken}`
        }
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        if (!token) {
          setToken(currentToken);
        }
        // Refresh capabilities alongside user so the two stay in sync
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
  };

  const login = async (email: string, password: string) => {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData
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
    setIdleTime(0);
    fetchCapabilitiesWith(data.access_token);
  };

  const loginWithGoogle = async (idToken: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/google-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token: idToken })
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
    setIdleTime(0);
    fetchCapabilitiesWith(data.access_token);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setIdleTime(0);
    setShowWarning(false);
    setCapabilities([]);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('capabilities');
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to change password');
    }

    // Update user state to reflect password changed
    setUser(prev => prev ? { ...prev, is_first_login: false } : null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isLoading,
      isAuthenticated,
      login,
      loginWithGoogle,
      logout,
      changePassword,
      checkAuth,
      idleTime,
      showWarning,
      dismissWarning,
      capabilities,
      can,
      refreshCapabilities,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
