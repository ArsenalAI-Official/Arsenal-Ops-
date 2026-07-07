// In-memory auth store: the current user + their capabilities, as the backend
// would return from /api/auth/* . Seeded fresh each test by resetAuthStore().
import type { UserResponse } from '@/client';

// The /me/capabilities body: effective caps + the role NAMES that grant them.
type EffectiveCapabilities = { roles: string[]; capabilities: string[] };
// The Token body /login, /google-login and /dev-login all return.
type TokenResponse = { access_token: string; token_type: string; user: UserResponse };
// One entry of the static capability registry (GET /api/auth/capabilities).
type CapabilityRegistryEntry = { key: string; description: string };

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

// Effective role NAMES for the current user. The backend sources these from the
// m2m `user.roles` relationship, which is deliberately decoupled from the
// legacy `user.role` string (see AuthContext.tsx + backend/routers/auth.py). We
// seed them explicitly rather than deriving from `role` so the fixture mirrors
// the real source of truth, not the legacy column.
export function seedRoles(): string[] {
  return ['admin'];
}

// Opaque token the mock login endpoints hand back. AuthContext only stores and
// echoes it as a Bearer header — it never decodes it — so any stable string
// works. Kept as a constant so tests can assert on the exact value written to
// localStorage after a login.
export const MOCK_ACCESS_TOKEN = 'mock-access-token';

let currentUser: UserResponse = seedCurrentUser();
let capabilities: string[] = seedCapabilities();
let roles: string[] = seedRoles();

export const authStore = {
  getUser: () => currentUser,
  setUser: (u: UserResponse) => {
    currentUser = u;
  },
  getCapabilities: () => capabilities,
  setCapabilities: (caps: string[]) => {
    capabilities = caps;
  },
  getRoles: () => roles,
  setRoles: (r: string[]) => {
    roles = r;
  },
  // The `Token` response body the backend's /login, /google-login and
  // /dev-login all return (see backend/routers/auth.py). The nested `user` is
  // the same shape as /auth/me.
  getTokenResponse: (): TokenResponse => ({
    access_token: MOCK_ACCESS_TOKEN,
    token_type: 'bearer',
    user: currentUser,
  }),
  // The /me/capabilities body: effective caps + the role names that grant them.
  // Distinct from the /capabilities registry endpoint below. Roles come from the
  // explicitly-seeded `roles` (the m2m source of truth), not the legacy string.
  getEffectiveCapabilities: (): EffectiveCapabilities => ({
    roles,
    capabilities,
  }),
  // The STATIC capability registry the admin role editor reads
  // (GET /api/auth/capabilities). Shape is [{key, description}] — distinct from
  // the effective-caps `string[]` above. Return-typed so any drift from the
  // Capability contract fails at compile time (this is the shape useRolesAdmin
  // consumes as Capability[]).
  getCapabilityRegistry: (): CapabilityRegistryEntry[] =>
    capabilities.map((key) => ({ key, description: `${key} capability` })),
};

export function resetAuthStore(): void {
  currentUser = seedCurrentUser();
  capabilities = seedCapabilities();
  roles = seedRoles();
}
