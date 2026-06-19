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
};

export function resetAuthStore(): void {
  currentUser = seedCurrentUser();
  capabilities = seedCapabilities();
}
