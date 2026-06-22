/**
 * Project tab registry — the single source of truth for which tabs exist
 * inside ProjectDetail, what capabilities gate them, and how they appear in
 * the role-editor picker. Adding a new tab is a single entry here.
 *
 * What this DOES drive:
 *   1. Tab strip visibility in ProjectDetail.tsx
 *   2. URL-direct-access "this section is restricted" gate
 *   3. Role-editor picker (Admin → Roles): label, description, sub-rows
 *
 * What this DOES NOT drive (kept per-tab because component shapes differ):
 *   - The actual `<TabComponent {...props} />` render — each tab takes a
 *     unique prop shape (hubWorkItems, sprints, pulseData, etc.) that's
 *     hard to make polymorphic without weakening types. The switch in
 *     ProjectDetail.tsx still handles that, but uses `canAccess(tab, ...)`
 *     from this file so the access logic stays here.
 *
 * To add a new tab:
 *   1. Add the capability key(s) to backend/capabilities.py.
 *   2. Add an entry to PROJECT_TABS below.
 *   3. Add a render block in ProjectDetail.tsx's `<Suspense>` body.
 *   4. (If sub-tabs are meaningful) add `picker.children` so admins can
 *      grant a subset from the role editor.
 *
 * The tab id MUST match the TabType in ProjectDetail.tsx so the switch
 * lines up.
 */
import type { LucideIcon } from 'lucide-react';
import { Info, BarChart3, Calendar, TrendingUp, Activity, Clock, DollarSign } from 'lucide-react';

/** Discriminator string used by ProjectDetail.tsx's TabType union. */
export type ProjectTabId =
  | 'overview'
  | 'tracker'
  | 'calendar'
  | 'pulse'
  | 'activity'
  | 'project_manager'
  | 'pulse_settings';

/**
 * Read/Write grants for a picker row. Each row may have:
 *   - `readGrant` only       → read-only surface (e.g. Timeline, Activity)
 *   - `writeGrant` only      → pure write action (e.g. AI Generators)
 *   - both                   → tab with view + edit actions (e.g. Project Board)
 *
 * The role editor renders 0–2 checkboxes per row based on which grants are
 * present, with a Write→Read dependency: ticking Write auto-ticks Read,
 * unticking Read also unticks Write (otherwise you'd grant "edit without
 * view," which is incoherent).
 */
export interface ProjectPickerChild {
  label: string;
  description: string;
  readGrant?: string;
  writeGrant?: string;
  /** Small text under the row — e.g. "Edits handled by per-project admin role". */
  footnote?: string;
}

export interface ProjectTabPickerSpec {
  description: string;
  /** Capability key that gates viewing the tab. Wildcard ok
   *  (e.g. `project.overview.*`). */
  readGrant?: string;
  /** Capability key that gates write actions on the tab. */
  writeGrant?: string;
  /** Optional sub-rows shown indented under this tab in the picker. */
  children?: readonly ProjectPickerChild[];
  footnote?: string;
}

export interface ProjectTabSpec {
  id: ProjectTabId;
  label: string;
  icon: LucideIcon;
  /** Capabilities that unlock the tab. User has access if they hold ANY
   *  of these. A single-key tab lists just one; a multi-section tab like
   *  Overview lists every sub-cap. */
  capabilities: readonly string[];
  /** Driven by `is_admin` on the project's developer membership. Used by
   *  the Project Manager tab so a project-admin developer sees it even
   *  without the global `project.pm` capability. */
  allowProjectAdmin?: boolean;
  /** Role-editor picker configuration. */
  picker: ProjectTabPickerSpec;
}

/**
 * The registry. Order here drives left-to-right order in the tab strip
 * and top-to-bottom order in the role-editor picker.
 */
export const PROJECT_TABS: readonly ProjectTabSpec[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: Info,
    capabilities: [
      'project.overview.prd',
      'project.overview.architecture',
      'project.overview.team',
      'project.overview.resources',
    ],
    picker: {
      readGrant: 'project.overview.*',
      writeGrant: 'project.overview_write',
      description: 'Project overview (PRD, architecture, team, resources)',
      // Note: per-project admins and tool admins (`admin.projects` / `*`)
      // can also edit Overview regardless of this capability, via
      // `is_project_admin` in backend/routers/projects.py. The picker UI
      // doesn't surface this in a footnote — it's documented here for
      // anyone editing the registry.
    },
  },
  {
    id: 'tracker',
    label: 'Project Tracker',
    icon: BarChart3,
    capabilities: ['project.tracker.sprints', 'project.tracker.analytics'],
    picker: {
      // Tracker tab is the in-app sprints + analytics view — read-only.
      // The kanban "Open Board" surface (a separate page) is a distinct
      // picker entry hand-added in AdminDashboard so its R/W pairing maps
      // cleanly to the `project.board` + `project.tracker_write` caps.
      readGrant: 'project.tracker.*',
      description: 'Project Tracker tab — sprints and analytics view',
    },
  },
  {
    id: 'calendar',
    label: 'Timeline',
    icon: Calendar,
    capabilities: ['project.calendar'],
    picker: {
      readGrant: 'project.calendar',
      description: 'Timeline view (read-only)',
    },
  },
  {
    id: 'pulse',
    label: 'Pulse',
    icon: TrendingUp,
    capabilities: ['project.pulse'],
    picker: {
      readGrant: 'project.pulse',
      description: 'Pulse data view',
    },
  },
  {
    id: 'activity',
    label: 'Activity',
    icon: Activity,
    capabilities: ['project.activity'],
    picker: {
      readGrant: 'project.activity',
      description: 'Activity feed (read-only)',
    },
  },
  {
    id: 'project_manager',
    label: 'Project Manager',
    icon: Clock,
    capabilities: ['project.pm'],
    allowProjectAdmin: true,
    picker: {
      readGrant: 'project.pm.*',
      description: 'Project Manager tab — toggle subsections individually below',
      children: [
        {
          label: 'Access tab',
          readGrant: 'project.pm',
          description: 'Open the Project Manager tab itself',
        },
        {
          label: 'Summary cards',
          readGrant: 'project.pm.summary_cards',
          description: 'Headline metrics at the top of the tab',
        },
        {
          label: 'Developer hours',
          readGrant: 'project.pm.developer_hours',
          description: 'Per-developer hours summary',
        },
      ],
    },
  },
  {
    id: 'pulse_settings',
    label: 'Pulse Settings',
    icon: DollarSign,
    capabilities: ['project.pulse.settings'],
    picker: {
      // Pulse Settings is purely a write surface (configure pulse overrides).
      // Single cap gates both viewing the tab and submitting the form, so
      // expressing as writeGrant-only is the honest framing — granting Read
      // for it would be meaningless.
      writeGrant: 'project.pulse.settings',
      description: 'Configure pulse data (admin)',
    },
  },
];

/**
 * Quick lookup by id — used by ProjectDetail's per-tab render branches.
 * Built once at module load so the cost is negligible.
 */
export const PROJECT_TABS_BY_ID = PROJECT_TABS.reduce(
  (acc, tab) => {
    acc[tab.id] = tab;
    return acc;
  },
  {} as Record<ProjectTabId, ProjectTabSpec>,
);

/**
 * Does the user have access to this tab? True when they hold any of the
 * tab's capabilities, OR (for `allowProjectAdmin` tabs) they're flagged
 * as a project admin on this specific project.
 */
export const canAccessProjectTab = (
  spec: ProjectTabSpec,
  can: (cap: string) => boolean,
  isProjectAdmin: boolean,
): boolean => {
  if (spec.capabilities.some((cap) => can(cap))) return true;
  if (spec.allowProjectAdmin && isProjectAdmin) return true;
  return false;
};
