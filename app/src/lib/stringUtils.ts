// Canonical string helpers. Consolidates copies previously duplicated across
// AdminDashboard tabs (toPascalCase) and ProjectHub views (getInitials).

/** `admin_user` → `AdminUser`. */
export function toPascalCase(str: string): string {
  return str
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
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
