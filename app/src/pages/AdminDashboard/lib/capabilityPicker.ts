/**
 * Pure capability-grant logic for the Roles editor.
 *
 * This was inline in AdminDashboard.tsx as a mix of pure predicates and
 * `setRoleForm`-wrapping closures. Extracted here as pure functions
 * (grants in → grants out) so the wildcard / auto-promote / Write→Read rules
 * can be unit-tested directly and reused. The component keeps `roleForm` state
 * and wraps the `apply*` helpers in `setRoleForm`.
 *
 * R/W model: every picker row carries up to two grants — `readGrant` (view)
 * and `writeGrant` (edit/create/delete) — and the editor renders 0–2 checkboxes
 * per row. The Write→Read dependency (ticking Write also ticks Read; unticking
 * Read also unticks Write) is enforced in `applyTogglePickerCheckbox`.
 */
import { PROJECT_TABS } from '@/lib/projectTabs';
import type { Capability } from '../types';

/** One pickable capability surface — a tab/feature row or a sub-row (child).
 *  Each row exposes up to two grants; rows render a checkbox per present side. */
export interface PickerChild {
  label: string;
  description: string;
  readGrant?: string;
  writeGrant?: string;
  footnote?: string;
}

export interface PickerItem extends PickerChild {
  /** Optional sub-rows shown indented under the parent. `readonly` to stay
   *  assignable from the modal's `CatalogItem` (which declares it readonly). */
  children?: readonly PickerChild[];
}

export interface PickerGroup {
  prefix: 'project' | 'admin';
  label: string;
  wildcard: string;
  items: PickerItem[];
}

/** Minimal structural shape the toggle/checked helpers need from a catalog
 *  node. Recursive because `isSideEffective` walks children depth-first; real
 *  catalogs are only 2 levels deep, but the type allows arbitrary nesting. */
export type ToggleNode = {
  readGrant?: string;
  writeGrant?: string;
  children?: readonly { readGrant?: string; writeGrant?: string }[];
};

/** Loose shape of a project-tab entry that `buildPickerCatalog` reads. The real
 *  `ProjectTabSpec` is wider (id/icon/capabilities) and assignable to this;
 *  tests can pass a minimal fake without constructing a full tab spec. */
export interface ProjectTabLike {
  label: string;
  picker: {
    description: string;
    readGrant?: string;
    writeGrant?: string;
    footnote?: string;
    children?: readonly {
      label: string;
      description: string;
      readGrant?: string;
      writeGrant?: string;
      footnote?: string;
    }[];
  };
}

/** Convert a snake_case role/key to PascalCase for display. */
export function toPascalCase(str: string): string {
  return str
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/** Does wildcard `grant` cover `key`? (`*` covers all; `x.*` covers `x` and `x.…`) */
export function wildcardCovers(grant: string, key: string): boolean {
  if (grant === '*') return true;
  if (!grant.endsWith('.*')) return false;
  const prefix = grant.slice(0, -2);
  return key === prefix || key.startsWith(prefix + '.');
}

/** Does `key` fall under the scope of `grant` (exact, wildcard, or `*`)? */
export function keyIsUnderGrant(key: string, grant: string): boolean {
  if (grant === '*') return true;
  if (grant.endsWith('.*')) {
    const prefix = grant.slice(0, -2);
    return key === prefix || key.startsWith(prefix + '.');
  }
  return key === grant;
}

/** Strict check: is this exact grant (or a wildcard ancestor) in `grants`?
 *  Sibling sub-caps and descendants do NOT count. The leaf primitive used by
 *  all the effective-check helpers below. */
export function isGrantHeld(grant: string, grants: string[]): boolean {
  if (grants.includes('*')) return true;
  if (grants.includes(grant)) return true;
  for (const g of grants) {
    if (!g.endsWith('.*')) continue;
    const prefix = g.slice(0, -2);
    // Covered when grant equals the wildcard's prefix or is a descendant —
    // e.g. grant='project.pm.*' is covered by g='project.*'.
    if (grant === prefix || grant.startsWith(prefix + '.')) return true;
  }
  return false;
}

/** Effective check for one *side* (read or write) of a picker row.
 *
 *  - Direct: the item's side-grant is in `grants` (or covered by an ancestor
 *    wildcard).
 *  - Auto-promote: the item has a side-grant AND children whose same-side
 *    grants are all effectively held — e.g. Overview's Read shows checked when
 *    all sub-tab Reads are granted, because Overview has `readGrant` to promote
 *    to. Children with no side-grant are vacuously held for that side.
 *
 *  Auto-promote is only meaningful when the parent itself has a side-grant to
 *  promote to; without one there is no checkbox to show checked. */
export function isSideEffective(
  item: ToggleNode,
  side: 'read' | 'write',
  grants: string[],
): boolean {
  const grant = side === 'read' ? item.readGrant : item.writeGrant;
  if (grant && isGrantHeld(grant, grants)) return true;
  if (!grant) return false;
  if (!item.children || item.children.length === 0) return false;
  return item.children.every((c) => {
    const cg = side === 'read' ? c.readGrant : c.writeGrant;
    if (!cg) return true; // vacuous — child doesn't expose this side
    return isSideEffective(c, side, grants);
  });
}

/** True when every defined side across the group is effectively held. Drives
 *  the "Grant all <Group>" checkbox: checked when the group wildcard is granted
 *  directly OR every R/W across every item (and its children) is covered. */
export function isGroupEffective(
  group: { wildcard: string; items: readonly ToggleNode[] },
  grants: string[],
): boolean {
  if (isGrantHeld(group.wildcard, grants)) return true;
  return group.items.every((item) => {
    const readOk = !item.readGrant || isSideEffective(item, 'read', grants);
    const writeOk = !item.writeGrant || isSideEffective(item, 'write', grants);
    const childrenReadOk =
      !item.children ||
      item.children.every((c) => !c.readGrant || isSideEffective(c, 'read', grants));
    const childrenWriteOk =
      !item.children ||
      item.children.every((c) => !c.writeGrant || isSideEffective(c, 'write', grants));
    return readOk && writeOk && childrenReadOk && childrenWriteOk;
  });
}

/** Sweep every explicit grant under a wildcard's prefix from `grants`. Used
 *  both when granting a wildcard (clean up redundant sub-caps) and when
 *  revoking one (purge everything it covered). Mutates the passed Set. */
function sweepUnder(wildcard: string, grants: Set<string>): void {
  if (!wildcard.endsWith('.*')) {
    grants.delete(wildcard);
    return;
  }
  const prefix = wildcard.slice(0, -2);
  for (const g of [...grants]) {
    if (g === wildcard || g === prefix || g.startsWith(prefix + '.')) grants.delete(g);
  }
}

/** Toggle a single leaf grant (the global `*` full-access checkbox). When
 *  unchecking a key that's only covered by a wildcard, the wildcard is expanded
 *  into its explicit sub-caps (minus the unchecked key) so the rest stay
 *  granted. Returns the next grant set. */
export function applyToggleGrant(grants: string[], key: string, registry: Capability[]): string[] {
  if (grants.includes(key)) {
    return grants.filter((g) => g !== key);
  }
  const coveringWildcards = grants.filter((g) => wildcardCovers(g, key));
  if (coveringWildcards.length > 0) {
    const nonCovering = grants.filter((g) => !coveringWildcards.includes(g));
    const expanded = new Set<string>(nonCovering);
    for (const cap of registry) {
      if (cap.key === key) continue;
      if (coveringWildcards.some((w) => keyIsUnderGrant(cap.key, w))) {
        expanded.add(cap.key);
      }
    }
    return Array.from(expanded);
  }
  return [...grants, key];
}

/** Toggle the group-level wildcard (the "Grant all Project / Admin" checkbox).
 *  Revoke drops the wildcard plus any explicit sub-caps under it; grant sweeps
 *  redundant sub-caps and adds the wildcard. Returns the next grant set. */
export function applyToggleGroupWildcard(
  grants: string[],
  group: { wildcard: string; items: readonly ToggleNode[] },
): string[] {
  const next = new Set(grants);
  const held = isGroupEffective(group, grants);
  sweepUnder(group.wildcard, next);
  if (!held) next.add(group.wildcard);
  return [...next];
}

/** Toggle one side (read or write) of a picker row. Implements the W→R
 *  dependency:
 *    - Ticking Write ON also adds Read ("edit but can't view" is incoherent).
 *    - Ticking Read OFF also clears Write (and sweeps children both sides).
 *  Single-side rows just toggle their one cap. When a side-grant is a wildcard,
 *  sub-caps under it are swept to keep the grant list minimal. Returns the next
 *  grant set. */
export function applyTogglePickerCheckbox(
  grants: string[],
  item: PickerChild | PickerItem,
  side: 'read' | 'write',
): string[] {
  const next = new Set(grants);
  const isOn = isSideEffective(item, side, grants);

  if (side === 'read') {
    if (isOn) {
      // Read OFF → also clear Write, and sweep all child grants both sides.
      if (item.readGrant) sweepUnder(item.readGrant, next);
      if (item.writeGrant) next.delete(item.writeGrant);
      const children = (item as PickerItem).children;
      if (children) {
        for (const c of children) {
          if (c.readGrant) sweepUnder(c.readGrant, next);
          if (c.writeGrant) next.delete(c.writeGrant);
        }
      }
    } else if (item.readGrant) {
      // Read ON
      sweepUnder(item.readGrant, next); // dedup
      next.add(item.readGrant);
    }
  } else if (isOn) {
    // Write OFF → Read stays.
    if (item.writeGrant) next.delete(item.writeGrant);
  } else {
    // Write ON → also ensure Read.
    if (item.writeGrant) next.add(item.writeGrant);
    if (item.readGrant && !isSideEffective(item, 'read', grants)) {
      sweepUnder(item.readGrant, next);
      next.add(item.readGrant);
    }
  }
  return [...next];
}

/**
 * Display catalog for the Roles role-editor picker.
 *
 * PROJECT items are mapped from the single project-tab registry
 * (`lib/projectTabs.ts`) so adding a tab there surfaces it here automatically
 * with the right label/description/grants/sub-rows. The write-only project
 * actions and the Project Board row live outside the tab registry and are
 * appended manually. The ADMIN group is hand-curated; as of the R/W split every
 * admin tab that has write actions exposes both a read cap (`admin.<tab>`) and a
 * write cap (`admin.<tab>_write`). See backend/capabilities.py.
 *
 * Accepts `projectTabs` as a parameter (defaulting to the real registry) so the
 * builder can be tested without coupling to the live tab list.
 */
export function buildPickerCatalog(
  projectTabs: readonly ProjectTabLike[] = PROJECT_TABS,
): PickerGroup[] {
  return [
    {
      prefix: 'project',
      label: 'Project',
      wildcard: 'project.*',
      items: [
        ...projectTabs.map((tab) => ({
          label: tab.label,
          description: tab.picker.description,
          readGrant: tab.picker.readGrant,
          writeGrant: tab.picker.writeGrant,
          footnote: tab.picker.footnote,
          children: tab.picker.children
            ? tab.picker.children.map((c) => ({
                label: c.label,
                description: c.description,
                readGrant: c.readGrant,
                writeGrant: c.writeGrant,
                footnote: c.footnote,
              }))
            : undefined,
        })),
        {
          // Project Board is a separate surface (`/project/{id}/board`) from the
          // Project Tracker tab. Read = open & view the board; Write =
          // create/edit/delete work items and sprints. Hand-added because it
          // isn't a tab in PROJECT_TABS.
          label: 'Project Board',
          description: 'Open the board to view items and sprints; create/edit/delete with write',
          readGrant: 'project.board',
          writeGrant: 'project.tracker_write',
        },
        {
          label: 'AI Generators',
          description: 'Run PRD analyzer and roadmap parser',
          writeGrant: 'project.ai.write',
        },
        {
          label: 'Create new projects',
          description: 'Create new projects from the home page',
          writeGrant: 'project.create',
        },
        {
          label: 'Assign personal tasks to project',
          description: 'Convert a personal task into a project ticket',
          writeGrant: 'project.assign_personal_task',
        },
      ],
    },
    {
      prefix: 'admin',
      label: 'Admin',
      wildcard: 'admin.*',
      items: [
        {
          label: 'Dashboard',
          description: 'Admin dashboard summary',
          readGrant: 'admin.dashboard',
        },
        {
          label: 'Employees',
          description: 'View, add, edit, and delete employees',
          readGrant: 'admin.employees',
          writeGrant: 'admin.employees_write',
        },
        {
          label: 'Projects',
          description: 'View admin projects list; edit GitHub settings',
          readGrant: 'admin.projects',
          writeGrant: 'admin.projects_write',
        },
        {
          label: 'Time Entries',
          description: 'View all time entries across projects',
          readGrant: 'admin.time_entries',
        },
        {
          label: 'Users',
          description: 'View, create, edit, delete users; assign roles',
          readGrant: 'admin.users',
          writeGrant: 'admin.users_write',
        },
        {
          label: 'Roles',
          description: 'View, create, edit, delete roles and capability grants',
          readGrant: 'admin.roles',
          writeGrant: 'admin.roles_write',
        },
      ],
    },
  ];
}
