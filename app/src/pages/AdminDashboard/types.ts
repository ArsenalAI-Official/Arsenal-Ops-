/**
 * Shared admin-domain types.
 *
 * Extracted from AdminDashboard.tsx so the shell, tabs, containers, and
 * per-domain hooks all reference one definition instead of redeclaring the
 * same shapes. (See the broader "no shared types module" audit note in
 * app/CLAUDE.md — this is the admin slice of that fix.)
 */

export interface Capability {
  key: string;
  description: string;
}

export type AdminTab = 'dashboard' | 'employees' | 'projects' | 'time_entries' | 'users' | 'roles';
export const VALID_ADMIN_TABS: AdminTab[] = [
  'dashboard',
  'employees',
  'projects',
  'time_entries',
  'users',
  'roles',
];

// Re-export the types owned by their component modules so downstream consumers
// have a single `./types` import surface for everything admin.
export type { ProjectCategory, CategoryFormPayload } from './modals/CategoryManagerModal';
export type { DeveloperCapacity } from './tabs/EmployeesTab';
