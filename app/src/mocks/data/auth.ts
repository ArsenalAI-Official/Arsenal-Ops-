// In-memory auth store: the current user + their capabilities, as the backend
// would return from /api/auth/* . Seeded fresh each test by resetAuthStore().
import type { UserResponse } from '@/client';

export function seedCurrentUser(): UserResponse {
  return {
    id: 1,
    name: 'Test User',
    email: 'test@arsenalai.com',
    role: 'admin',
    is_first_login: false,
  };
}

// A broad default capability set so happy-path renders show write affordances.
export function seedCapabilities(): string[] {
  return ['projects.view', 'projects.edit', 'workitems.view', 'workitems.edit', 'admin.view'];
}

// Opaque token the mock login endpoints hand back. AuthContext only stores and
// echoes it as a Bearer header — it never decodes it — so any stable string
// works. Kept as a constant so tests can assert on the exact value written to
// localStorage after a login.
export const MOCK_ACCESS_TOKEN = 'mock-access-token';

let currentUser: UserResponse = seedCurrentUser();
let capabilities: string[] = seedCapabilities();

export const authStore = {
  getUser: () => currentUser,
  setUser: (u: UserResponse) => {
    currentUser = u;
  },
  getCapabilities: () => capabilities,
  setCapabilities: (caps: string[]) => {
    capabilities = caps;
  },
  // The `Token` response body the backend's /login, /google-login and
  // /dev-login all return (see backend/routers/auth.py). The nested `user` is
  // the same shape as /auth/me.
  getTokenResponse: () => ({
    access_token: MOCK_ACCESS_TOKEN,
    token_type: 'bearer',
    user: currentUser,
  }),
  // The /me/capabilities body: effective caps + the role names that grant them.
  // Distinct from the /capabilities registry endpoint used by the admin UI.
  getEffectiveCapabilities: () => ({
    roles: currentUser.role ? currentUser.role.split(',').map((r) => r.trim()) : [],
    capabilities,
  }),
};

export function resetAuthStore(): void {
  currentUser = seedCurrentUser();
  capabilities = seedCapabilities();
}
