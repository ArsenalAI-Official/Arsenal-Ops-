/**
 * Single source of truth for the admin-capability set.
 *
 * The /admin route guard in App.tsx + every place that decides "should this
 * user see the Admin nav link?" all consume this list, so the route guard
 * and the link visibility can't drift apart.
 *
 * Mirrors the admin.* keys defined in backend/capabilities.py — if you add
 * a new admin capability there, add it here too so the link surfaces it.
 */
export const ADMIN_CAPABILITIES = [
  'admin.dashboard',
  'admin.employees',
  'admin.projects',
  'admin.time_entries',
  'admin.users',
  'admin.roles',
] as const;

/**
 * Does the caller hold any admin.* capability? Used to decide whether to
 * render the Admin nav link and whether to allow the /admin route to mount.
 */
export const hasAnyAdminCapability = (can: (cap: string) => boolean): boolean =>
  ADMIN_CAPABILITIES.some((cap) => can(cap));
