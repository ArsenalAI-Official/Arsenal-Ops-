import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  FolderKanban,
  X,
  ArrowLeft,
  BarChart3,
  Shield,
  KeyRound,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast, Toaster } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import { PROJECT_TABS } from '@/lib/projectTabs';
import {
  invalidateProjectScope,
  invalidateAdminMembershipImpact,
  invalidateAdminUserRoleImpact,
} from '@/lib/invalidations';
import RoleModal from './modals/RoleModal';
import EmployeeModal from './modals/EmployeeModal';
import UserModal from './modals/UserModal';
import EditUserModal from './modals/EditUserModal';
import GitHubModal from './modals/GitHubModal';
import ProjectMembersModal from './modals/ProjectMembersModal';
import CategoryManagerModal, {
  type ProjectCategory,
  type CategoryFormPayload,
} from './modals/CategoryManagerModal';
import EmployeesTab, { type Employee, type DeveloperCapacity } from './tabs/EmployeesTab';
import TimeEntriesTab from './tabs/TimeEntriesTab';
import DashboardTab from './tabs/DashboardTab';
import ProjectsTab from './tabs/ProjectsTab';
import UsersTab from './tabs/UsersTab';
import RolesTab from './tabs/RolesTab';

interface User {
  id: number;
  email: string;
  name: string;
  role: string; // Comma-separated roles
  is_active: boolean;
  is_first_login: boolean;
  created_at: string;
  last_login_at: string | null;
  github_username?: string | null;
}

interface Project {
  id: number;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  total_items: number;
  done_items: number;
  completion_pct: number;
  developer_count: number;
  github_repo_url: string | null;
  github_repo_urls?: string[];
  github_repo_name: string | null;
  has_github_token: boolean;
  // Category surface — flat fields populated by GET /api/admin/projects.
  // null when the project hasn't been assigned to any category.
  category_id: number | null;
  category_name: string | null;
}

interface DashboardStats {
  total_employees: number;
  total_projects: number;
  total_tickets: number;
  active_sprints: number;
  tickets_by_status: Record<string, number>;
  tickets_by_priority: Record<string, number>;
}

interface Role {
  id: number;
  name: string;
  description: string | null;
  is_system: boolean;
  capability_keys: string[];
  user_count?: number;
  created_at?: string;
  updated_at?: string;
}

interface ProjectWeeklyReportRow {
  project_id: number;
  project_name: string;
  category_id: number | null;
  category_name: string | null;
  todo_backlog: number;
  in_progress: number;
  in_review: number;
  done_this_week: number;
}

interface ProjectWeeklyReport {
  week_start: string;
  week_end: string;
  rows: ProjectWeeklyReportRow[];
}

interface Capability {
  key: string;
  description: string;
}

type AdminTab = 'dashboard' | 'employees' | 'projects' | 'time_entries' | 'users' | 'roles';

/**
 * Tab order + the capability that gates each. Order drives both the tab-strip
 * left-to-right and the "first allowed tab" fallback below — keep them aligned
 * with the picker catalog's Admin section in `PICKER_CATALOG`.
 */
const ADMIN_TAB_CAPS: ReadonlyArray<{ id: AdminTab; cap: string }> = [
  { id: 'dashboard', cap: 'admin.dashboard' },
  { id: 'employees', cap: 'admin.employees' },
  { id: 'projects', cap: 'admin.projects' },
  { id: 'time_entries', cap: 'admin.time_entries' },
  { id: 'users', cap: 'admin.users' },
  { id: 'roles', cap: 'admin.roles' },
];

/**
 * Resolve which admin tab to render. Single source of truth used by both the
 * `useState` lazy initializer (correct on first paint) and the URL-sync
 * effect (correct on browser back/forward).
 *
 * Rules:
 *   - If the URL specifies a tab and the user has its cap → use it.
 *   - Else fall back to the FIRST tab in `ADMIN_TAB_CAPS` the user can see.
 *   - Else 'dashboard' as a defensive last resort — shouldn't happen because
 *     `RequireAnyAdminCapability` guards the route, but keeps the return
 *     type honest if caps drift mid-session.
 */
function resolveAdminTab(urlTab: string | null, hasAccess: (cap: string) => boolean): AdminTab {
  if (urlTab) {
    const requested = ADMIN_TAB_CAPS.find((t) => t.id === urlTab);
    if (requested && hasAccess(requested.cap)) return requested.id;
  }
  const firstAllowed = ADMIN_TAB_CAPS.find((t) => hasAccess(t.cap));
  return firstAllowed ? firstAllowed.id : 'dashboard';
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Auth hook hoisted above the tab-state setup so `can` is available to the
  // `useState` lazy initializer below — that's how we resolve the right
  // starting tab on first paint without a flash of restricted content.
  const { user, refreshCapabilities, can } = useAuth(); // keeps auth guard active; token read from localStorage by apiFetch

  const tabFromUrl = searchParams.get('tab');
  // Lazy initializer so we read `can` exactly once on mount. If the URL
  // points at a tab the user can see → use it. Otherwise fall back to the
  // first tab they can see (skipping the "Section restricted" splash).
  const [activeTab, setActiveTabState] = useState<AdminTab>(() => resolveAdminTab(tabFromUrl, can));

  const setActiveTab = (tab: AdminTab) => {
    setActiveTabState(tab);
    if (tab === 'dashboard') {
      const next = new URLSearchParams(searchParams);
      next.delete('tab');
      setSearchParams(next, { replace: false });
    } else {
      const next = new URLSearchParams(searchParams);
      next.set('tab', tab);
      setSearchParams(next, { replace: false });
    }
  };

  // Sync state with URL on browser back/forward navigation, and self-correct
  // when the URL points at a tab the user can't see (or no tab at all and
  // the user lacks `admin.dashboard`). Deliberately reads activeTab without
  // listing it as a dep so the effect only runs when the URL changes, not
  // when state changes back.
  useEffect(() => {
    const urlTab = searchParams.get('tab');
    const resolved = resolveAdminTab(urlTab, can);
    if (resolved !== activeTab) {
      setActiveTabState(resolved);
    }
    // If the URL referred to a forbidden / unknown tab, rewrite it to
    // match the resolved tab so refresh + share both work. `replace: true`
    // so this self-correction doesn't litter browser history.
    const expectedUrlTab = resolved === 'dashboard' ? null : resolved;
    if (urlTab !== expectedUrlTab) {
      const next = new URLSearchParams(searchParams);
      if (expectedUrlTab === null) next.delete('tab');
      else next.set('tab', expectedUrlTab);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const queryClient = useQueryClient();

  // Admin queries override the global `refetchOnMount: false` because admin is
  // a snapshot view — when the user opens this tab, they expect current data,
  // not whatever's been sitting in the cache. With `refetchOnMount: 'always'`,
  // every mount triggers a background refetch even if invalidation was missed
  // by an upstream mutation. Endpoints are fast (Bucket A optimizations) so
  // the cost is a brief refetch flicker on tab entry.
  const ADMIN_REFETCH = { refetchOnMount: 'always' } as const;

  const statsQuery = useQuery<DashboardStats>({
    queryKey: ['admin', 'stats'],
    queryFn: () => apiFetch<DashboardStats>('/api/admin/stats'),
    ...ADMIN_REFETCH,
  });
  const stats = statsQuery.data ?? null;

  const employeesQuery = useQuery<Employee[]>({
    queryKey: ['admin', 'employees'],
    queryFn: () => apiFetch<Employee[]>('/api/admin/employees'),
    ...ADMIN_REFETCH,
  });
  // useMemo keeps the array reference stable across renders so the
  // useMemo hooks downstream (filtered/sorted views) don't bust their
  // caches every render.
  const employees = useMemo(() => employeesQuery.data ?? [], [employeesQuery.data]);

  const capacityQuery = useQuery<DeveloperCapacity[]>({
    queryKey: ['admin', 'developers-capacity'],
    queryFn: () => apiFetch<DeveloperCapacity[]>('/api/admin/developers/capacity'),
    ...ADMIN_REFETCH,
  });
  const developerCapacities = useMemo(() => capacityQuery.data ?? [], [capacityQuery.data]);

  const projectsQuery = useQuery<Project[]>({
    queryKey: ['admin', 'projects'],
    queryFn: () => apiFetch<Project[]>('/api/admin/projects'),
    ...ADMIN_REFETCH,
  });
  // Stabilize the empty default — `data ?? []` creates a new array every
  // render, which busts the downstream `filteredProjects` useMemo. See
  // app/CLAUDE.md "Stabilize empty-default arrays".
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);

  // Project categories — admin-managed labels for organizing projects.
  // Same ADMIN_REFETCH cadence as the rest of the admin queries.
  const categoriesQuery = useQuery<ProjectCategory[]>({
    queryKey: ['admin', 'projectCategories'],
    queryFn: () => apiFetch<ProjectCategory[]>('/api/admin/project-categories/'),
    ...ADMIN_REFETCH,
  });
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);

  const usersQuery = useQuery<User[]>({
    queryKey: ['admin', 'users'],
    queryFn: () => apiFetch<User[]>('/api/auth/admin/users'),
    ...ADMIN_REFETCH,
  });
  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);

  const rolesQuery = useQuery<Role[]>({
    queryKey: ['admin', 'roles'],
    queryFn: () => apiFetch<Role[]>('/api/auth/admin/roles'),
    ...ADMIN_REFETCH,
  });
  const roles = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data]);

  const capabilitiesQuery = useQuery<Capability[]>({
    queryKey: ['admin', 'capabilities'],
    queryFn: () => apiFetch<Capability[]>('/api/auth/capabilities'),
    ...ADMIN_REFETCH,
  });
  const capabilityRegistry = useMemo(() => capabilitiesQuery.data ?? [], [capabilitiesQuery.data]);

  const loading =
    statsQuery.isLoading ||
    employeesQuery.isLoading ||
    capacityQuery.isLoading ||
    projectsQuery.isLoading ||
    usersQuery.isLoading ||
    rolesQuery.isLoading;

  // Team capacity summary derived from employees + capacity data
  const WEEKLY_CAPACITY_HRS = 40;
  const teamCapacity = useMemo(() => {
    const perDev = employees
      .map((emp) => {
        const cap = developerCapacities.find((d) => d.developer_id === emp.id);
        const used = cap?.this_week_capacity_used ?? 0;
        const inProgress = cap?.this_week_in_progress_hours ?? 0;
        const inReview = cap?.this_week_in_review_hours ?? 0;
        const done = cap?.this_week_done_hours ?? 0;
        const remaining = Math.max(0, WEEKLY_CAPACITY_HRS - used);
        const utilization = Math.round((used / WEEKLY_CAPACITY_HRS) * 100);
        const status: 'Available' | 'Moderate' | 'Busy' =
          remaining >= 10 ? 'Available' : remaining > 0 ? 'Moderate' : 'Busy';
        return {
          id: emp.id,
          name: emp.name,
          inProgress,
          inReview,
          done,
          used,
          remaining,
          utilization,
          status,
        };
      })
      .sort((a, b) => b.used - a.used);

    const totalCapacity = perDev.length * WEEKLY_CAPACITY_HRS;
    const totalUsed = perDev.reduce((s, p) => s + p.used, 0);
    const totalInProgress = perDev.reduce((s, p) => s + p.inProgress, 0);
    const totalInReview = perDev.reduce((s, p) => s + p.inReview, 0);
    const totalDone = perDev.reduce((s, p) => s + p.done, 0);
    const totalRemaining = Math.max(0, totalCapacity - totalUsed);
    const counts = perDev.reduce(
      (acc, p) => {
        acc[p.status] += 1;
        return acc;
      },
      { Available: 0, Moderate: 0, Busy: 0 } as Record<'Available' | 'Moderate' | 'Busy', number>,
    );
    const utilization = totalCapacity > 0 ? Math.round((totalUsed / totalCapacity) * 100) : 0;
    const weekStart = developerCapacities.find((c) => c.week_start)?.week_start;
    const weekEnd = developerCapacities.find((c) => c.week_end)?.week_end;
    return {
      perDev,
      totalCapacity,
      totalUsed,
      totalInProgress,
      totalInReview,
      totalDone,
      totalRemaining,
      counts,
      utilization,
      weekStart,
      weekEnd,
    };
  }, [employees, developerCapacities]);

  const availableSpecs = useMemo(
    () =>
      Array.from(
        new Set(employees.map((e) => e.specialization).filter((s): s is string => !!s)),
      ).sort(),
    [employees],
  );

  // Per-tab capability gates. The /admin route guard in App.tsx already
  // ensures the user holds at least one admin.* capability before this
  // component mounts; these gates control which tabs they actually see
  // and protect against URL-direct access (?tab=users) for caps the user lacks.
  const canSeeDashboard = can('admin.dashboard');
  const canSeeEmployees = can('admin.employees');
  const canSeeProjects = can('admin.projects');
  const canSeeTimeEntries = can('admin.time_entries');
  const canSeeUsers = can('admin.users');
  const canSeeRoles = can('admin.roles');
  // Write caps — gate action buttons (Add/Edit/Delete) inside each tab.
  // Tabs receive these as props so the components stay decoupled from the
  // auth context.
  const canWriteEmployees = can('admin.employees_write');
  const canWriteProjects = can('admin.projects_write');
  const canWriteUsers = can('admin.users_write');
  const canWriteRoles = can('admin.roles_write');

  // Refresh capabilities twice: once now, once after the backend LRU window
  // expires for the most common case. Used after role mutations that may
  // affect the current user's capabilities.
  const refreshCapsTwice = () => {
    refreshCapabilities();
    setTimeout(() => refreshCapabilities(), 1500);
  };

  // Role dropdown state (per-user role-edit modal trigger; modal lives at parent)
  const [openRoleDropdown, setOpenRoleDropdown] = useState<number | null>(null);

  // Helper function to convert role to Pascal Case (still used by the parent's
  // role-dropdown modal below)
  const toPascalCase = (str: string): string => {
    return str
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  };

  // RBAC role create/edit modal state
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState<{
    name: string;
    description: string;
    capability_keys: string[];
  }>({ name: '', description: '', capability_keys: [] });

  // Employee form state
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [employeeForm, setEmployeeForm] = useState({
    name: '',
    email: '',
    github_username: '',
    specialization: '',
  });

  // GitHub settings state
  const [showGitHubModal, setShowGitHubModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [gitHubForm, setGitHubForm] = useState({
    github_repo_url: '',
    github_repo_name: '',
    github_token: '',
  });
  const [invitingProjectId, setInvitingProjectId] = useState<number | null>(null);

  // Project members modal state
  const [showProjectMembersModal, setShowProjectMembersModal] = useState(false);
  const [selectedProjectForMembers, setSelectedProjectForMembers] = useState<Project | null>(null);
  const [addMemberForm, setAddMemberForm] = useState<{ developer_id: string; role: string }>({
    developer_id: '',
    role: 'developer',
  });

  // Category manager modal + filter state.
  // categoryFilter values:
  //   'all'           → no filter (default)
  //   'uncategorized' → only projects with category_id === null
  //   '<numeric id>'  → only projects with category_id === Number(value)
  // The string-id form pairs naturally with a native <select> whose option
  // values are always strings — avoids a discriminated-union for one dropdown.
  const [showCategoryManagerModal, setShowCategoryManagerModal] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Filtered projects feed into the ProjectsTab card grid. Computed here so
  // the filter state lives next to the project list and we don't ship a
  // separate filtering hook into the tab.
  const filteredProjects = useMemo(() => {
    if (categoryFilter === 'all') return projects;
    if (categoryFilter === 'uncategorized') return projects.filter((p) => p.category_id === null);
    const id = Number(categoryFilter);
    return Number.isFinite(id) ? projects.filter((p) => p.category_id === id) : projects;
  }, [projects, categoryFilter]);

  // Weekly report — server-side filtered by the same category filter the card
  // grid uses. The query key includes `categoryFilter` so React Query refetches
  // on filter change. We translate the encoded filter into the query-string
  // params the backend expects (`uncategorized=true` vs `category_id=<id>`).
  const weeklyReportQuery = useQuery<ProjectWeeklyReport>({
    queryKey: ['admin', 'projectsWeeklyReport', categoryFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (categoryFilter === 'uncategorized') {
        params.set('uncategorized', 'true');
      } else {
        const id = Number(categoryFilter);
        if (Number.isFinite(id)) params.set('category_id', String(id));
      }
      const qs = params.toString();
      return apiFetch<ProjectWeeklyReport>(
        `/api/admin/projects/weekly-report${qs ? `?${qs}` : ''}`,
      );
    },
    ...ADMIN_REFETCH,
  });

  // ── Category CRUD mutations ───────────────────────────────────────────
  // Invalidate four keys on any category mutation:
  //   ['admin','projectCategories'] — drives the manager modal list
  //   ['admin','projects']          — project cards show category badges
  //   ['admin','projectsWeeklyReport'] — report rows include category_name
  //   ['projectCategories']         — home-page CreateProjectDialog picker
  // A rename of a category needs to reflow into the cards AND the report;
  // an assignment change re-buckets which projects show in a filtered report.
  const invalidateCategoryScope = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'projectCategories'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'projectsWeeklyReport'] });
    queryClient.invalidateQueries({ queryKey: ['projectCategories'] });
  };

  const createCategoryMutation = useMutation({
    mutationFn: (payload: CategoryFormPayload) =>
      apiFetch<ProjectCategory>('/api/admin/project-categories/', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      invalidateCategoryScope();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create category'),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: CategoryFormPayload }) =>
      apiFetch<ProjectCategory>(`/api/admin/project-categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      invalidateCategoryScope();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to update category'),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(`/api/admin/project-categories/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, deletedId) => {
      // Reset the filter to 'all' ONLY if the active filter was on the
      // category we just deleted — otherwise a delete of an unrelated
      // category would silently change the user's filter.
      setCategoryFilter((current) => (current === String(deletedId) ? 'all' : current));
      invalidateCategoryScope();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to delete category'),
  });

  // Assigning a category to a single project. Uses the existing
  // Dedicated admin endpoint — gated on `admin.projects_write` so a
  // read-only admin (or per-project admin only) can't reorganize the
  // admin-wide categorization. Passing null clears the assignment.
  const setProjectCategoryMutation = useMutation({
    mutationFn: ({ projectId, categoryId }: { projectId: number; categoryId: number | null }) =>
      apiFetch(`/api/admin/projects/${projectId}/category`, {
        method: 'PUT',
        body: JSON.stringify({ category_id: categoryId }),
      }),
    onSuccess: () => {
      invalidateCategoryScope();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Failed to update project category'),
  });

  const handleEditEmployee = (employee: Employee) => {
    setEditingEmployee(employee);
    setEmployeeForm({
      name: employee.name,
      email: employee.email,
      github_username: employee.github_username || '',
      specialization: employee.specialization || '',
    });
    setShowEmployeeModal(true);
  };

  const saveEmployeeMutation = useMutation({
    mutationFn: () => {
      const url = editingEmployee
        ? `/api/admin/employees/${editingEmployee.id}`
        : `/api/admin/employees`;
      const method = editingEmployee ? 'PUT' : 'POST';
      return apiFetch<Employee>(url, { method, body: JSON.stringify(employeeForm) });
    },
    onSuccess: () => {
      toast.success(editingEmployee ? 'Employee updated!' : 'Employee created!');
      setShowEmployeeModal(false);
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to save employee'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'employees'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'developers-capacity'] });
      queryClient.invalidateQueries({ queryKey: ['developers'] });
    },
  });

  const handleSaveEmployee = () => {
    if (!employeeForm.name.trim() || !employeeForm.email.trim()) {
      toast.error('Name and email are required');
      return;
    }
    saveEmployeeMutation.mutate();
  };

  const deleteEmployeeMutation = useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/api/admin/employees/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Employee deleted');
    },
    onError: () => toast.error('Failed to delete employee'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'employees'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'developers-capacity'] });
      queryClient.invalidateQueries({ queryKey: ['developers'] });
    },
  });

  const handleDeleteEmployee = (id: number) => {
    if (!confirm('Are you sure you want to delete this employee?')) return;
    deleteEmployeeMutation.mutate(id);
  };

  // GitHub settings functions
  const handleEditGitHubSettings = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProject(project);
    setGitHubForm({
      github_repo_url: project.github_repo_url || '',
      github_repo_name: project.github_repo_name || '',
      github_token: '', // Don't show existing token
    });
    setShowGitHubModal(true);
  };

  const saveGitHubMutation = useMutation({
    mutationFn: () => {
      if (!editingProject) throw new Error('No project selected');
      return apiFetch<void>(`/api/admin/projects/${editingProject.id}/github`, {
        method: 'PUT',
        body: JSON.stringify(gitHubForm),
      });
    },
    onSuccess: () => {
      toast.success('GitHub settings updated!');
      setShowGitHubModal(false);
    },
    onError: () => toast.error('Failed to update GitHub settings'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      invalidateProjectScope(queryClient, editingProject?.id);
    },
  });

  const handleSaveGitHubSettings = () => saveGitHubMutation.mutate();

  const sendGitHubInvitesMutation = useMutation({
    mutationFn: (project: Project) =>
      apiFetch<{ successful_invitations: number }>(
        `/api/projects/${project.id}/github-invite?role=push`,
        {
          method: 'POST',
        },
      ),
    onSuccess: (data, project) => {
      toast.success(
        `Sent ${data.successful_invitations} GitHub invitation(s) for ${project.name}!`,
      );
      setInvitingProjectId(null);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to send invitations');
      setInvitingProjectId(null);
    },
  });

  const handleSendGitHubInvites = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!project.github_repo_url) {
      toast.error('No GitHub repository configured');
      return;
    }
    setInvitingProjectId(project.id);
    sendGitHubInvitesMutation.mutate(project);
  };

  // Project members management
  const projectMembersQuery = useQuery<{
    developers: Array<{
      id: number;
      name: string;
      email: string;
      role?: string;
      responsibilities?: string;
      is_admin?: boolean;
    }>;
  }>({
    queryKey: ['project', selectedProjectForMembers?.id],
    queryFn: () => apiFetch(`/api/projects/${selectedProjectForMembers!.id}`),
    enabled: !!selectedProjectForMembers,
  });
  const projectMembers = projectMembersQuery.data?.developers ?? [];
  const projectMembersLoading = projectMembersQuery.isLoading;

  const handleOpenProjectMembers = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedProjectForMembers(project);
    setShowProjectMembersModal(true);
    setAddMemberForm({ developer_id: '', role: 'developer' });
  };

  const addMemberMutation = useMutation({
    mutationFn: ({ projectId, devId, role }: { projectId: number; devId: number; role: string }) =>
      apiFetch<void>(`/api/projects/${projectId}/developers`, {
        method: 'POST',
        body: JSON.stringify({ developer_id: devId, role }),
      }),
    onSuccess: () => {
      toast.success('Member added');
      setAddMemberForm({ developer_id: '', role: 'developer' });
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to add member'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      invalidateProjectScope(queryClient, selectedProjectForMembers?.id);
      invalidateAdminMembershipImpact(queryClient);
    },
  });

  const handleAddProjectMember = () => {
    if (!selectedProjectForMembers) return;
    const devId = parseInt(addMemberForm.developer_id, 10);
    if (!devId) {
      toast.error('Select an employee to add');
      return;
    }
    addMemberMutation.mutate({
      projectId: selectedProjectForMembers.id,
      devId,
      role: addMemberForm.role || 'developer',
    });
  };

  const removeMemberMutation = useMutation({
    mutationFn: ({ projectId, developerId }: { projectId: number; developerId: number }) =>
      apiFetch<void>(`/api/projects/${projectId}/developers/${developerId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Member removed');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to remove member'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      invalidateProjectScope(queryClient, selectedProjectForMembers?.id);
      invalidateAdminMembershipImpact(queryClient);
    },
  });

  const handleRemoveProjectMember = (developerId: number) => {
    if (!selectedProjectForMembers) return;
    if (
      !confirm('Remove this member from the project? Their assigned work items will be unassigned.')
    )
      return;
    removeMemberMutation.mutate({ projectId: selectedProjectForMembers.id, developerId });
  };

  // User management functions
  const [showUserModal, setShowUserModal] = useState(false);
  const [userForm, setUserForm] = useState<{ email: string; name: string; roles: string[] }>({
    email: '',
    name: '',
    roles: ['developer'],
  });

  const handleRoleToggle = (role: string) => {
    setUserForm((f) => {
      const roles = f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role];
      return { ...f, roles: roles.length > 0 ? roles : ['developer'] };
    });
  };

  const createUserMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ status: string }>('/api/auth/admin/create-user', {
        method: 'POST',
        body: JSON.stringify({ ...userForm, role: userForm.roles.join(',') }),
      }),
    onSuccess: () => {
      toast.success('User authorized. They can now sign in with Google SSO.');
      setShowUserModal(false);
      setUserForm({ email: '', name: '', roles: ['developer'] });
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to create user'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      // Developer-role users also surface in the Employees tab — keep both
      // tabs consistent on role mutations.
      queryClient.invalidateQueries({ queryKey: ['admin', 'employees'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      // Backend creates a Developer row when role includes 'developer' — keep
      // the per-project add-developer dropdown in sync.
      queryClient.invalidateQueries({ queryKey: ['developers'] });
    },
  });

  const handleSaveUser = () => {
    if (!userForm.email.trim() || !userForm.name.trim()) {
      toast.error('Email and name are required');
      return;
    }
    createUserMutation.mutate();
  };

  const deleteUserMutation = useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/api/auth/admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => toast.success('User deleted'),
    onError: (err: any) => toast.error(err?.message || 'Failed to delete user'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      // Deleting a user cascades to their developer record (if any), so refresh
      // the dependent lists too.
      queryClient.invalidateQueries({ queryKey: ['admin', 'employees'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['developers'] });
    },
  });

  const handleDeleteUser = (user: User) => {
    if (
      !confirm(
        `Delete user "${user.name}" (${user.email})? They'll lose access immediately. This cannot be undone.`,
      )
    )
      return;
    deleteUserMutation.mutate(user.id);
  };

  // Edit-user profile (name + email + github_username) — distinct from role
  // editing which lives behind the inline "Edit Roles" pill.
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserForm, setEditUserForm] = useState<{
    name: string;
    email: string;
    github_username: string;
  }>({ name: '', email: '', github_username: '' });

  const updateUserMutation = useMutation({
    mutationFn: (vars: { id: number; name: string; email: string; github_username: string }) =>
      apiFetch<User>(`/api/auth/admin/users/${vars.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: vars.name,
          email: vars.email,
          github_username: vars.github_username,
        }),
      }),
    onSuccess: () => {
      toast.success('User updated');
      setEditingUser(null);
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to update user'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      // Name/email/github changes flow through to Developer rows too.
      queryClient.invalidateQueries({ queryKey: ['admin', 'employees'] });
      queryClient.invalidateQueries({ queryKey: ['developers'] });
    },
  });

  const handleOpenEditUser = (user: User) => {
    setEditingUser(user);
    setEditUserForm({
      name: user.name,
      email: user.email,
      github_username: user.github_username || '',
    });
  };

  const handleSaveEditUser = () => {
    if (!editingUser) return;
    const name = editUserForm.name.trim();
    const email = editUserForm.email.trim();
    if (!name || !email) {
      toast.error('Name and email are required');
      return;
    }
    updateUserMutation.mutate({
      id: editingUser.id,
      name,
      email,
      github_username: editUserForm.github_username.trim(),
    });
  };

  // RBAC: role create/update/delete mutations
  const invalidateRoles = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
  };

  const createRoleMutation = useMutation({
    mutationFn: (vars: { name: string; description: string | null; capability_keys: string[] }) =>
      apiFetch<Role>('/api/auth/admin/roles', {
        method: 'POST',
        body: JSON.stringify(vars),
      }),
    onSuccess: (_data, vars) => {
      toast.success(`Role '${vars.name}' created`);
      setShowRoleModal(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to create role';
      toast.error(msg);
    },
    onSettled: () => {
      invalidateRoles();
      // Any role the current user holds could now have different caps.
      refreshCapsTwice();
    },
  });

  const updateRoleMetaMutation = useMutation({
    mutationFn: (vars: { id: number; name: string; description: string | null }) =>
      apiFetch<Role>(`/api/auth/admin/roles/${vars.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: vars.name, description: vars.description }),
      }),
    onSettled: () => {
      invalidateRoles();
      refreshCapsTwice();
    },
  });

  const replaceRoleCapsMutation = useMutation({
    mutationFn: (vars: { id: number; capability_keys: string[] }) =>
      apiFetch<Role>(`/api/auth/admin/roles/${vars.id}/capabilities`, {
        method: 'PUT',
        body: JSON.stringify({ capability_keys: vars.capability_keys }),
      }),
    onSettled: () => {
      invalidateRoles();
      refreshCapsTwice();
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/api/auth/admin/roles/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, _id) => {
      toast.success('Role deleted');
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to delete role';
      toast.error(msg);
    },
    onSettled: () => {
      invalidateRoles();
      refreshCapsTwice();
    },
  });

  const assignUserRoleMutation = useMutation({
    mutationFn: (vars: { userId: number; roleId: number }) =>
      apiFetch<void>(`/api/auth/admin/users/${vars.userId}/roles/${vars.roleId}`, {
        method: 'POST',
      }),
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to assign role';
      toast.error(msg);
    },
    onSettled: (_data, _err, vars) => {
      invalidateRoles();
      invalidateAdminUserRoleImpact(queryClient);
      if (vars && vars.userId === user?.id) {
        refreshCapsTwice();
      }
    },
  });

  const removeUserRoleMutation = useMutation({
    mutationFn: (vars: { userId: number; roleId: number }) =>
      apiFetch<void>(`/api/auth/admin/users/${vars.userId}/roles/${vars.roleId}`, {
        method: 'DELETE',
      }),
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to remove role';
      toast.error(msg);
    },
    onSettled: (_data, _err, vars) => {
      invalidateRoles();
      invalidateAdminUserRoleImpact(queryClient);
      if (vars && vars.userId === user?.id) {
        refreshCapsTwice();
      }
    },
  });

  const isSavingRole =
    createRoleMutation.isPending ||
    updateRoleMetaMutation.isPending ||
    replaceRoleCapsMutation.isPending;

  const handleOpenCreateRole = () => {
    setEditingRole(null);
    setRoleForm({ name: '', description: '', capability_keys: [] });
    setShowRoleModal(true);
  };

  const handleOpenEditRole = (role: Role) => {
    setEditingRole(role);
    setRoleForm({
      name: role.name,
      description: role.description || '',
      capability_keys: [...role.capability_keys],
    });
    setShowRoleModal(true);
  };

  const handleSaveRole = async () => {
    const name = roleForm.name.trim();
    if (!name) {
      toast.error('Role name is required');
      return;
    }
    if (editingRole) {
      try {
        const needsMetaUpdate =
          name !== editingRole.name ||
          (roleForm.description || '') !== (editingRole.description || '');
        if (needsMetaUpdate) {
          await updateRoleMetaMutation.mutateAsync({
            id: editingRole.id,
            // System roles keep their original name; description is editable.
            name: editingRole.is_system ? editingRole.name : name,
            description: roleForm.description.trim() || null,
          });
        }
        await replaceRoleCapsMutation.mutateAsync({
          id: editingRole.id,
          capability_keys: roleForm.capability_keys,
        });
        setShowRoleModal(false);
        invalidateRoles();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save role';
        toast.error(msg);
      }
    } else {
      createRoleMutation.mutate({
        name,
        description: roleForm.description.trim() || null,
        capability_keys: roleForm.capability_keys,
      });
    }
  };

  const handleDeleteRole = (role: Role) => {
    if (role.is_system) {
      toast.error('Cannot delete a system role');
      return;
    }
    if (
      !confirm(
        `Delete role "${role.name}"? Users assigned to this role will lose its capabilities.`,
      )
    )
      return;
    deleteRoleMutation.mutate(role.id);
  };

  const handleToggleUserRoleById = (user: User, role: Role, isChecked: boolean) => {
    if (isChecked) {
      assignUserRoleMutation.mutate({ userId: user.id, roleId: role.id });
    } else {
      removeUserRoleMutation.mutate({ userId: user.id, roleId: role.id });
    }
  };

  // Returns true if `grant` is a wildcard that covers `key`.
  const wildcardCovers = (grant: string, key: string): boolean => {
    if (grant === '*') return true;
    if (!grant.endsWith('.*')) return false;
    const prefix = grant.slice(0, -2);
    return key === prefix || key.startsWith(prefix + '.');
  };

  // Returns true if `key` falls under the scope of `grant`.
  const keyIsUnderGrant = (key: string, grant: string): boolean => {
    if (grant === '*') return true;
    if (grant.endsWith('.*')) {
      const prefix = grant.slice(0, -2);
      return key === prefix || key.startsWith(prefix + '.');
    }
    return key === grant;
  };

  const toggleGrant = (key: string) => {
    setRoleForm((f) => {
      const grants = f.capability_keys;
      if (grants.includes(key)) {
        return { ...f, capability_keys: grants.filter((g) => g !== key) };
      }
      const coveringWildcards = grants.filter((g) => wildcardCovers(g, key));
      if (coveringWildcards.length > 0) {
        const nonCovering = grants.filter((g) => !coveringWildcards.includes(g));
        const expanded = new Set<string>(nonCovering);
        for (const cap of capabilityRegistry) {
          if (cap.key === key) continue;
          if (coveringWildcards.some((w) => keyIsUnderGrant(cap.key, w))) {
            expanded.add(cap.key);
          }
        }
        return { ...f, capability_keys: Array.from(expanded) };
      }
      return { ...f, capability_keys: [...grants, key] };
    });
  };

  // Display catalog for the Roles role-editor picker.
  //
  // Each row now carries up to two grants: `readGrant` (view) and
  // `writeGrant` (edit/create/delete). The role editor renders 0–2
  // checkboxes per row accordingly, with a Write→Read dependency enforced
  // in `togglePickerCheckbox` below.
  //
  // PROJECT items are mapped from `lib/projectTabs.ts` so adding a tab
  // surfaces it here automatically with the right label/description/grants.
  // The three write-only project actions (AI, Create project, Assign
  // personal task) live outside the tab registry and are appended manually.
  //
  // The ADMIN group is hand-curated. As of the R/W split, every admin tab
  // that has write actions exposes both a read cap (`admin.<tab>`) and a
  // write cap (`admin.<tab>_write`). See backend/capabilities.py +
  // `reconcile_admin_write_caps` in database.py.
  interface PickerChild {
    label: string;
    description: string;
    readGrant?: string;
    writeGrant?: string;
    footnote?: string;
  }
  interface PickerItem extends PickerChild {
    children?: PickerChild[];
  }

  const PICKER_CATALOG: {
    prefix: 'project' | 'admin';
    label: string;
    wildcard: string;
    items: PickerItem[];
  }[] = useMemo(
    () => [
      {
        prefix: 'project',
        label: 'Project',
        wildcard: 'project.*',
        items: [
          ...PROJECT_TABS.map((tab) => ({
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
            // Project Board is a separate surface (`/project/{id}/board`)
            // from the Project Tracker tab. Read = open & view the board;
            // Write = create/edit/delete work items and sprints. Hand-added
            // here because it isn't a tab in PROJECT_TABS.
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
    ],
    [],
  );

  /** Strict check: is this exact grant (or a wildcard ancestor) in `grants`.
   *  Used as the leaf primitive by all the effective-check helpers below. */
  const isGrantHeld = (grant: string, grants: string[]): boolean => {
    if (grants.includes('*')) return true;
    if (grants.includes(grant)) return true;
    for (const g of grants) {
      if (!g.endsWith('.*')) continue;
      const prefix = g.slice(0, -2);
      if (grant === prefix || grant.startsWith(prefix + '.')) return true;
    }
    return false;
  };

  /** A node the toggle helpers consume — kept structurally compatible with
   *  the picker item / child shape but only requires the side-grant fields. */
  type ToggleNode = {
    readGrant?: string;
    writeGrant?: string;
    children?: readonly { readGrant?: string; writeGrant?: string }[];
  };

  /** Effective check for one *side* (read or write) of a picker row.
   *
   *  - Direct: the item's side-grant is in `grants` (or covered by an
   *    ancestor wildcard).
   *  - Auto-promote: the item has a side-grant AND children whose same-side
   *    grants are all effectively held — e.g. Overview's Read shows checked
   *    when all four sub-tab Reads are granted explicitly, because Overview
   *    has `readGrant=project.overview.*` to promote to.
   *
   *  Auto-promote is only meaningful when the parent itself has a side-grant
   *  to promote to. Otherwise the "every child checked" condition is
   *  vacuous (read-only parents have no Write checkbox, so promoting an
   *  imaginary Write checkbox makes no sense).
   *
   *  Children with no side-grant are "vacuously held" for that side — they
   *  don't drag the parent down. Without this, Overview's Read auto-promote
   *  would fail if any child lacked an explicit grant for that side (none
   *  do today, but the rule keeps the auto-promote robust to future shapes).
   */
  const isSideEffective = (item: ToggleNode, side: 'read' | 'write', grants: string[]): boolean => {
    const grant = side === 'read' ? item.readGrant : item.writeGrant;
    if (grant && isGrantHeld(grant, grants)) return true;
    // No side-grant to promote to → no auto-promote.
    if (!grant) return false;
    if (!item.children || item.children.length === 0) return false;
    return item.children.every((c) => {
      const cg = side === 'read' ? c.readGrant : c.writeGrant;
      if (!cg) return true; // vacuous — child doesn't expose this side
      return isSideEffective(c, side, grants);
    });
  };

  /** True when every item-side defined across the group is effectively held.
   *  Drives the "Grant all <Group>" checkbox: shows checked when the group
   *  wildcard is granted directly OR every R/W across every item is covered.
   */
  const isGroupEffective = (
    group: { wildcard: string; items: ToggleNode[] },
    grants: string[],
  ): boolean => {
    if (isGrantHeld(group.wildcard, grants)) return true;
    return group.items.every((item) => {
      const readOk = !item.readGrant || isSideEffective(item, 'read', grants);
      const writeOk = !item.writeGrant || isSideEffective(item, 'write', grants);
      // Children also need to be covered when present — recurse via
      // isSideEffective's own child-check rather than re-implementing.
      const childrenReadOk =
        !item.children ||
        item.children.every((c) => !c.readGrant || isSideEffective(c, 'read', grants));
      const childrenWriteOk =
        !item.children ||
        item.children.every((c) => !c.writeGrant || isSideEffective(c, 'write', grants));
      return readOk && writeOk && childrenReadOk && childrenWriteOk;
    });
  };

  /** Sweep every explicit grant under a wildcard's prefix from `grants`.
   *  Used both when granting a wildcard (clean up redundant sub-caps) and
   *  when revoking one (purge everything it covered). */
  const sweepUnder = (wildcard: string, grants: Set<string>): void => {
    if (!wildcard.endsWith('.*')) {
      grants.delete(wildcard);
      return;
    }
    const prefix = wildcard.slice(0, -2);
    for (const g of [...grants]) {
      if (g === wildcard || g === prefix || g.startsWith(prefix + '.')) grants.delete(g);
    }
  };

  /** Toggle the group-level wildcard (the "Grant all Project / Admin"
   *  checkbox). Same shape as the previous catalog toggle, but spelled out
   *  for the new picker contract. */
  const toggleGroupWildcard = (group: { wildcard: string; items: ToggleNode[] }) => {
    setRoleForm((f) => {
      const next = new Set(f.capability_keys);
      const wildcardHeld = isGroupEffective(group, f.capability_keys);
      if (wildcardHeld) {
        // Revoke: drop the wildcard plus any explicit sub-caps under it.
        sweepUnder(group.wildcard, next);
      } else {
        // Grant: sweep redundant sub-caps and add the wildcard.
        sweepUnder(group.wildcard, next);
        next.add(group.wildcard);
      }
      return { ...f, capability_keys: [...next] };
    });
  };

  /** Toggle one side (read or write) of a picker row. Implements the
   *  W→R dependency:
   *    - Ticking Write ON also adds Read (otherwise: "edit but can't view"
   *      is incoherent).
   *    - Ticking Read OFF also clears Write (same reason in reverse).
   *  Single-side rows (read-only or write-only) just toggle their one cap.
   *  When the item's side-grant is a wildcard, sub-caps under it are swept
   *  to keep the grant list minimal.
   */
  const togglePickerCheckbox = (item: ToggleNode, side: 'read' | 'write') => {
    setRoleForm((f) => {
      const next = new Set(f.capability_keys);
      const isOn = isSideEffective(item, side, f.capability_keys);

      if (side === 'read') {
        if (isOn) {
          // Read OFF → also clear Write.
          if (item.readGrant) sweepUnder(item.readGrant, next);
          if (item.writeGrant) next.delete(item.writeGrant);
          // Sweep all child grants on both sides (children become ungranted
          // when the parent's read is revoked).
          if (item.children) {
            for (const c of item.children) {
              if (c.readGrant) sweepUnder(c.readGrant, next);
              if (c.writeGrant) next.delete(c.writeGrant);
            }
          }
        } else {
          // Read ON
          if (item.readGrant) {
            sweepUnder(item.readGrant, next); // dedup
            next.add(item.readGrant);
          }
        }
      } else {
        // Write
        if (isOn) {
          // Write OFF → Read stays.
          if (item.writeGrant) next.delete(item.writeGrant);
        } else {
          // Write ON → also ensure Read.
          if (item.writeGrant) next.add(item.writeGrant);
          if (item.readGrant && !isSideEffective(item, 'read', f.capability_keys)) {
            sweepUnder(item.readGrant, next);
            next.add(item.readGrant);
          }
        }
      }
      return { ...f, capability_keys: [...next] };
    });
  };

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <Toaster position="top-right" theme="dark" />

      {/* Header */}
      <div className="border-b border-[rgba(255,255,255,0.05)] bg-[#0d0d0d]">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => navigate('/')}
                className="text-[#737373] hover:text-white"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Projects
              </Button>
              <div className="h-6 w-px bg-[rgba(255,255,255,0.08)]" />
              <h1 className="text-xl font-bold text-white">Admin Dashboard</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[rgba(255,255,255,0.05)]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto pb-2">
            {[
              ...(canSeeDashboard
                ? [{ id: 'dashboard', label: 'Dashboard', icon: BarChart3 }]
                : []),
              ...(canSeeEmployees ? [{ id: 'employees', label: 'Employees', icon: Users }] : []),
              ...(canSeeProjects
                ? [{ id: 'projects', label: 'Projects', icon: FolderKanban }]
                : []),
              ...(canSeeTimeEntries
                ? [{ id: 'time_entries', label: 'Time Entries', icon: Clock }]
                : []),
              ...(canSeeUsers ? [{ id: 'users', label: 'Users', icon: Shield }] : []),
              ...(canSeeRoles ? [{ id: 'roles', label: 'Roles', icon: KeyRound }] : []),
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`px-4 py-3 flex items-center gap-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-[#E0B954] text-white'
                    : 'border-transparent text-[#737373] hover:text-white'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-2 border-[#E0B954] border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            {/* Dashboard Tab — gated on admin.dashboard */}
            {activeTab === 'dashboard' &&
              (canSeeDashboard ? (
                stats && <DashboardTab stats={stats} setActiveTab={setActiveTab} />
              ) : (
                <div className="text-center py-12 text-[#737373]">This section is restricted.</div>
              ))}

            {/* Employees Tab — gated on admin.employees */}
            {activeTab === 'employees' &&
              (canSeeEmployees ? (
                <EmployeesTab
                  employees={employees}
                  developerCapacities={developerCapacities}
                  teamCapacity={teamCapacity}
                  availableSpecs={availableSpecs}
                  onEditEmployee={handleEditEmployee}
                  onDeleteEmployee={handleDeleteEmployee}
                  canWriteEmployees={canWriteEmployees}
                />
              ) : (
                <div className="text-center py-12 text-[#737373]">This section is restricted.</div>
              ))}

            {/* Projects Tab — gated on admin.projects */}
            {activeTab === 'projects' &&
              (canSeeProjects ? (
                <ProjectsTab
                  projects={filteredProjects}
                  categories={categories}
                  categoryFilter={categoryFilter}
                  onCategoryFilterChange={setCategoryFilter}
                  onOpenCategoryManager={() => setShowCategoryManagerModal(true)}
                  onSetProjectCategory={(projectId, categoryId) =>
                    setProjectCategoryMutation.mutate({ projectId, categoryId })
                  }
                  weeklyReport={weeklyReportQuery.data ?? null}
                  weeklyReportLoading={weeklyReportQuery.isLoading}
                  invitingProjectId={invitingProjectId}
                  onEditGitHubSettings={handleEditGitHubSettings}
                  onSendGitHubInvites={handleSendGitHubInvites}
                  onOpenProjectMembers={handleOpenProjectMembers}
                  canWriteProjects={canWriteProjects}
                />
              ) : (
                <div className="text-center py-12 text-[#737373]">This section is restricted.</div>
              ))}

            {/* Time Entries Tab — gated on admin.time_entries */}
            {activeTab === 'time_entries' &&
              (canSeeTimeEntries ? (
                <TimeEntriesTab projects={projects} employees={employees} />
              ) : (
                <div className="text-center py-12 text-[#737373]">This section is restricted.</div>
              ))}

            {/* Users Tab — gated on admin.users */}
            {activeTab === 'users' &&
              (canSeeUsers ? (
                <UsersTab
                  users={users}
                  onEditUserRoles={setOpenRoleDropdown}
                  onAddUser={() => setShowUserModal(true)}
                  onDeleteUser={handleDeleteUser}
                  onEditUser={handleOpenEditUser}
                  // Hide Add/Edit/Delete user buttons without users-write.
                  canWriteUsers={canWriteUsers}
                  // Edit Roles affordance gates on roles-write since it
                  // mutates user_roles (handled server-side by the same cap).
                  canWriteRoles={canWriteRoles}
                />
              ) : (
                <div className="text-center py-12 text-[#737373]">This section is restricted.</div>
              ))}

            {/* Roles Tab — gated on admin.roles */}
            {activeTab === 'roles' &&
              (canSeeRoles ? (
                <RolesTab
                  roles={roles}
                  isDeletingRole={deleteRoleMutation.isPending}
                  onCreateRole={handleOpenCreateRole}
                  onEditRole={handleOpenEditRole}
                  onDeleteRole={handleDeleteRole}
                  canWriteRoles={canWriteRoles}
                />
              ) : (
                <div className="text-center py-12 text-[#737373]">This section is restricted.</div>
              ))}
          </>
        )}
      </div>

      {/* Role Create/Edit Modal */}
      <RoleModal
        open={showRoleModal}
        onClose={() => setShowRoleModal(false)}
        editingRole={editingRole}
        roleForm={roleForm}
        setRoleForm={setRoleForm}
        isSavingRole={isSavingRole}
        pickerCatalog={PICKER_CATALOG}
        toggleGrant={toggleGrant}
        toggleGroupWildcard={toggleGroupWildcard}
        togglePickerCheckbox={togglePickerCheckbox}
        isGrantHeld={isGrantHeld}
        isSideEffective={isSideEffective}
        isGroupEffective={isGroupEffective}
        toPascalCase={toPascalCase}
        handleSaveRole={handleSaveRole}
      />

      {/* Role Management Modal (per-user role assignment) */}
      {openRoleDropdown &&
        users.find((u) => u.id === openRoleDropdown) &&
        (() => {
          const targetUser = users.find((u) => u.id === openRoleDropdown)!;
          const userRoleNames = new Set(
            targetUser.role
              .split(',')
              .map((r) => r.trim())
              .filter(Boolean),
          );
          return (
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => setOpenRoleDropdown(null)}
            >
              <div
                className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl max-h-[80vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header — Shield icon tile + title + user avatar/name +
                    assignment counter pill. The counter gives instant
                    feedback as roles are toggled (no save button needed —
                    changes auto-persist via handleToggleUserRoleById). */}
                <div className="flex items-center justify-between gap-3 p-5 border-b border-[rgba(255,255,255,0.05)]">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E0B954]/15 to-[#B8872A]/10 border border-[#E0B954]/20 flex items-center justify-center shrink-0">
                      <Shield className="w-5 h-5 text-[#E0B954]" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg font-bold text-white leading-tight">Edit Roles</h2>
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className="w-4 h-4 rounded-full bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center shrink-0">
                          <span className="text-[8px] font-semibold text-white">
                            {targetUser.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-xs text-[#a3a3a3] truncate">{targetUser.name}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {roles.length > 0 && (
                      <span
                        className="text-[10px] tabular-nums px-2 py-1 rounded-md border font-medium"
                        style={{
                          color: userRoleNames.size > 0 ? '#E0B954' : '#737373',
                          backgroundColor:
                            userRoleNames.size > 0
                              ? 'rgba(224,185,84,0.1)'
                              : 'rgba(255,255,255,0.04)',
                          borderColor:
                            userRoleNames.size > 0
                              ? 'rgba(224,185,84,0.25)'
                              : 'rgba(255,255,255,0.06)',
                        }}
                        title={`${userRoleNames.size} of ${roles.length} roles assigned`}
                      >
                        {userRoleNames.size} / {roles.length}
                      </span>
                    )}
                    <button
                      onClick={() => setOpenRoleDropdown(null)}
                      className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="p-4 space-y-1.5 overflow-y-auto">
                  {roles.length === 0 ? (
                    <div className="py-10 text-center">
                      <KeyRound className="w-7 h-7 text-[#525252] mx-auto mb-2" />
                      <p className="text-sm text-[#a3a3a3] font-medium">No roles defined yet</p>
                      <p className="text-xs text-[#525252] mt-1">
                        Create roles in the Roles tab to assign them here.
                      </p>
                    </div>
                  ) : (
                    roles.map((role) => {
                      const isChecked = userRoleNames.has(role.name);
                      return (
                        <label
                          key={role.id}
                          className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors border ${
                            isChecked
                              ? 'bg-[rgba(224,185,84,0.06)] border-[rgba(224,185,84,0.2)] hover:bg-[rgba(224,185,84,0.09)]'
                              : 'bg-transparent border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.025)] hover:border-[rgba(255,255,255,0.08)]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) =>
                              handleToggleUserRoleById(targetUser, role, e.target.checked)
                            }
                            className="w-4 h-4 rounded cursor-pointer mt-0.5 shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Role chip — same KeyRound + Pascal-case
                                  treatment used in the Roles tab table so the
                                  same role reads identically across screens. */}
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                                  isChecked
                                    ? 'bg-[#E0B954]/20 text-[#E0B954]'
                                    : 'bg-[rgba(255,255,255,0.04)] text-[#a3a3a3]'
                                }`}
                              >
                                <KeyRound className="w-3 h-3" />
                                {toPascalCase(role.name)}
                              </span>
                              {role.is_system && (
                                <span className="text-[9px] uppercase tracking-wider text-[#737373] px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)]">
                                  System
                                </span>
                              )}
                            </div>
                            {role.description && (
                              <p className="text-xs text-[#a3a3a3] mt-1.5 leading-relaxed">
                                {role.description}
                              </p>
                            )}
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          );
        })()}

      <EmployeeModal
        open={showEmployeeModal}
        onClose={() => setShowEmployeeModal(false)}
        editingEmployee={editingEmployee}
        employeeForm={employeeForm}
        setEmployeeForm={setEmployeeForm}
        handleSaveEmployee={handleSaveEmployee}
      />

      <UserModal
        open={showUserModal}
        onClose={() => setShowUserModal(false)}
        userForm={userForm}
        setUserForm={setUserForm}
        handleRoleToggle={handleRoleToggle}
        handleSaveUser={handleSaveUser}
        roles={roles}
      />

      <EditUserModal
        open={!!editingUser}
        onClose={() => setEditingUser(null)}
        userLabel={editingUser ? `${editingUser.name} (${editingUser.email})` : ''}
        form={editUserForm}
        setForm={setEditUserForm}
        onSave={handleSaveEditUser}
        isSaving={updateUserMutation.isPending}
      />

      <GitHubModal
        open={showGitHubModal}
        onClose={() => setShowGitHubModal(false)}
        editingProject={editingProject}
        gitHubForm={gitHubForm}
        setGitHubForm={setGitHubForm}
        handleSaveGitHubSettings={handleSaveGitHubSettings}
      />

      <ProjectMembersModal
        open={showProjectMembersModal}
        onClose={() => setShowProjectMembersModal(false)}
        selectedProjectForMembers={selectedProjectForMembers}
        projectMembers={projectMembers}
        projectMembersLoading={projectMembersLoading}
        employees={employees}
        addMemberForm={addMemberForm}
        setAddMemberForm={setAddMemberForm}
        handleAddProjectMember={handleAddProjectMember}
        handleRemoveProjectMember={handleRemoveProjectMember}
        addMemberPending={addMemberMutation.isPending}
        removeMemberPending={removeMemberMutation.isPending}
      />

      <CategoryManagerModal
        open={showCategoryManagerModal}
        onOpenChange={setShowCategoryManagerModal}
        categories={categories}
        isLoading={categoriesQuery.isLoading}
        isMutating={
          createCategoryMutation.isPending ||
          updateCategoryMutation.isPending ||
          deleteCategoryMutation.isPending
        }
        onCreate={(payload) => createCategoryMutation.mutateAsync(payload).then(() => undefined)}
        onUpdate={(id, payload) =>
          updateCategoryMutation.mutateAsync({ id, payload }).then(() => undefined)
        }
        onDelete={(id) => deleteCategoryMutation.mutateAsync(id).then(() => undefined)}
      />
    </div>
  );
};

export default AdminDashboard;
