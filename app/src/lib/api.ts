/**
 * Shared authenticated-fetch helper for use inside react-query ``queryFn``
 * and ``mutationFn`` callbacks.
 *
 * Why this exists:
 *
 * - Reads the auth token from ``localStorage`` at fetch time (not from a
 *   captured ``useAuth()`` value). If the queryFn closed over the context's
 *   ``token`` value, the closure would hold the old token after rotation
 *   until react-query rebuilt the queryFn. Reading localStorage per fetch
 *   sidesteps the closure-capture problem entirely.
 * - Throws ``ApiError`` on non-2xx so react-query's ``error`` state
 *   surfaces a useful status code + detail message instead of an opaque
 *   ``Error("HTTP 401")``.
 * - Handles 204 No Content by returning ``undefined`` cast to ``T``.
 */
import { API_BASE_URL } from '@/config/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Latch so a simultaneous burst of 401s from TanStack Query's on-focus
// refetch (which happens after a long idle when the JWT has expired) only
// triggers one redirect, not one per query. Reset by the full-page navigation.
let unauthorizedRedirectInFlight = false;

function handleUnauthorized(path: string): void {
  // Don't bounce while we're already on the login flow — the auth endpoints
  // legitimately return 401 (e.g. wrong password), and the login page itself
  // would loop. AuthContext.checkAuth handles /me 401 explicitly via logout(),
  // so leave that path alone too.
  if (path.startsWith('/api/auth/')) return;
  if (typeof window === 'undefined') return;
  if (window.location.pathname === '/login') return;
  if (unauthorizedRedirectInFlight) return;
  unauthorizedRedirectInFlight = true;

  // Clear stored creds so AuthContext sees a logged-out state on next mount.
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('capabilities');

  // Full-page nav cancels every in-flight fetch and resets TanStack Query —
  // exactly what a hard refresh used to do manually, just automatic now.
  window.location.href = '/login';
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');

  // Don't set Content-Type on GET/DELETE or when body is FormData/URLSearchParams.
  // For JSON-bodied mutations the caller is expected to JSON.stringify the body
  // and pass it in init.body — we default to application/json then.
  const isJsonBody =
    init.body !== undefined &&
    !(init.body instanceof FormData) &&
    !(init.body instanceof URLSearchParams);

  const headers: Record<string, string> = {
    ...(isJsonBody ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init.headers as Record<string, string>) ?? {}),
  };

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  if (!res.ok) {
    if (res.status === 401) {
      handleUnauthorized(path);
    }
    let detail: string;
    try {
      const body = await res.json();
      detail = body.detail ?? res.statusText;
    } catch {
      detail = res.statusText;
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}
