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

export interface ProjectPickerChild {
  label: string;
  grant: string;
  description: string;
}

export interface ProjectTabPickerSpec {
  /** Capability key the role-editor checkbox toggles. Usually a wildcard
   *  ('project.overview.*') for tabs with sub-caps; or a single key
   *  ('project.calendar') for leaf tabs. */
  grant: string;
  description: string;
  /** Optional sub-rows shown indented under this tab in the picker. */
  children?: readonly ProjectPickerChild[];
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
      grant: 'project.overview.*',
      description: 'Project overview tab (PRD, architecture, team, resources)',
    },
  },
  {
    id: 'tracker',
    label: 'Project Tracker',
    icon: BarChart3,
    capabilities: ['project.tracker.sprints', 'project.tracker.analytics'],
    picker: {
      grant: 'project.tracker.*',
      description: 'Sprints and tracker analytics',
    },
  },
  {
    id: 'calendar',
    label: 'Timeline',
    icon: Calendar,
    capabilities: ['project.calendar'],
    picker: {
      grant: 'project.calendar',
      description: 'Timeline tab',
    },
  },
  {
    id: 'pulse',
    label: 'Pulse',
    icon: TrendingUp,
    capabilities: ['project.pulse'],
    picker: {
      grant: 'project.pulse',
      description: 'Pulse tab',
    },
  },
  {
    id: 'activity',
    label: 'Activity',
    icon: Activity,
    capabilities: ['project.activity'],
    picker: {
      grant: 'project.activity',
      description: 'Activity feed tab',
    },
  },
  {
    id: 'project_manager',
    label: 'Project Manager',
    icon: Clock,
    capabilities: ['project.pm'],
    allowProjectAdmin: true,
    picker: {
      grant: 'project.pm.*',
      description: 'Project Manager tab — toggle subsections individually below',
      children: [
        {
          label: 'Access tab',
          grant: 'project.pm',
          description: 'Open the Project Manager tab itself',
        },
        {
          label: 'Summary cards',
          grant: 'project.pm.summary_cards',
          description: 'Headline metrics at the top of the tab',
        },
        {
          label: 'Developer hours',
          grant: 'project.pm.developer_hours',
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
      grant: 'project.pulse.settings',
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
