// Canonical string helpers. Consolidates copies previously duplicated across
// AdminDashboard tabs (formatRoleName) and ProjectHub views (getInitials).

/**
 * `project_manager` → `Project Manager`. The single canonical role-name
 * formatter (audit #26): Title Case with spaces, everywhere a role name is
 * shown in Admin. Capitalizes each underscore-separated part while leaving the
 * rest of the word intact, so existing acronyms/casing (e.g. `QA`) survive and
 * already-friendly custom role names pass through cleanly.
 */
export function formatRoleName(name: string): string {
  return name
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** `"Jane Doe"` → `"JD"` (up to 2 uppercase initials). */
export function getInitials(name: string): string {
  return (name || '')
    .trim()
    .split(/\s+/)
    .map((n) => n[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
