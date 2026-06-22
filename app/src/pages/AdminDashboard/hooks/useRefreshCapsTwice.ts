import { useAuth } from '@/contexts/AuthContext';

/**
 * Returns a function that refreshes the current user's capabilities twice:
 * once now, once after ~1.5s to outlast the backend's capability LRU window.
 * Used after role mutations that may change the current user's own caps.
 */
export function useRefreshCapsTwice() {
  const { refreshCapabilities } = useAuth();
  return () => {
    refreshCapabilities();
    setTimeout(() => refreshCapabilities(), 1500);
  };
}
