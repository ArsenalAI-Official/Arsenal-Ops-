/**
 * Capability matching — mirrors backend/capabilities.py::matches().
 *
 * A grant covers a needed capability key if it is "*", an exact match, or a
 * wildcard prefix (e.g. "project.*" covers "project.foo" and "project.foo.bar"
 * and the bare "project" key itself).
 */
export function matchesCapability(needed: string, grants: readonly string[]): boolean {
  for (const grant of grants) {
    if (grant === '*' || grant === needed) return true;
    if (grant.endsWith('.*')) {
      const prefix = grant.slice(0, -2);
      if (needed === prefix || needed.startsWith(prefix + '.')) return true;
    }
  }
  return false;
}
