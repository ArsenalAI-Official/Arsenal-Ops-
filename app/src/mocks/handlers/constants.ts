// Single source of the API base the mock server answers on. Must match the
// app's runtime base (src/config/api.ts → VITE_API_URL, pinned in
// vitest.config.ts) PLUS the `/api` prefix every backend route carries.
//
// apiFetch('/api/projects') hits `${VITE_API_URL}/api/projects`, so handlers
// register against `${API_BASE}/projects`.
export const API_ORIGIN = 'http://localhost:8000';
export const API_BASE = `${API_ORIGIN}/api`;
