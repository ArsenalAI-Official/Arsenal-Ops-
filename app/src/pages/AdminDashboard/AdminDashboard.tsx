import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, FolderKanban, X, ArrowLeft, BarChart3, Shield, KeyRound } from 'lucide-react';
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

type AdminTab = 'dashboard' | 'employees' | 'projects' | 'users' | 'roles';
const VALID_ADMIN_TABS: AdminTab[] = ['dashboard', 'employees', 'projects', 'users', 'roles'];

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const initialTab: AdminTab =
    tabFromUrl && (VALID_ADMIN_TABS as string[]).includes(tabFromUrl)
      ? (tabFromUrl as AdminTab)
      : 'dashboard';
  const [activeTab, setActiveTabState] = useState<AdminTab>(initialTab);

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

  // Sync state with URL on browser back/forward navigation. Pre-existing
  // pattern; deliberately reads activeTab without listing it as a dep so
  // the effect only runs when the URL changes, not when state changes back.
  useEffect(() => {
    const urlTab = searchParams.get('tab');
    const resolved: AdminTab =
      urlTab && (VALID_ADMIN_TABS as string[]).includes(urlTab)
        ? (urlTab as AdminTab)
        : 'dashboard';
    if (resolved !== activeTab) {
      setActiveTabState(resolved);
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

  const { user, refreshCapabilities, can } = useAuth(); // keeps auth guard active; token read from localStorage by apiFetch

  // Per-tab capability gates. The /admin route guard in App.tsx already
  // ensures the user holds at least one admin.* capability before this
  // component mounts; these gates control which tabs they actually see
  // and protect against URL-direct access (?tab=users) for caps the user lacks.
  const canSeeDashboard = can('admin.dashboard');
  const canSeeEmployees = can('admin.employees');
  const canSeeProjects = can('admin.projects');
  const canSeeUsers = can('admin.users');
  const canSeeRoles = can('admin.roles');

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
  // Invalidate three keys on any category mutation:
  //   ['admin','projectCategories'] — drives the manager modal list
  //   ['admin','projects']          — project cards show category badges
  //   ['admin','projectsWeeklyReport'] — report rows include category_name
  // A rename of a category needs to reflow into the cards AND the report;
  // an assignment change re-buckets which projects show in a filtered report.
  const invalidateCategoryScope = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'projectCategories'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'projectsWeeklyReport'] });
  };

  const createCategoryMutation = useMutation({
    mutationFn: (payload: CategoryFormPayload) =>
      apiFetch<ProjectCategory>('/api/admin/project-categories/', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success('Category created');
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
      toast.success('Category updated');
      invalidateCategoryScope();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to update category'),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(`/api/admin/project-categories/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, deletedId) => {
      toast.success('Category deleted');
      // Reset the filter to 'all' ONLY if the active filter was on the
      // category we just deleted — otherwise a delete of an unrelated
      // category would silently change the user's filter.
      setCategoryFilter((current) => (current === String(deletedId) ? 'all' : current));
      invalidateCategoryScope();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to delete category'),
  });

  // Assigning a category to a single project. Uses the existing
  // PUT /api/projects/{id} surface (extended with category_id support).
  // Passing null clears the assignment ("uncategorized").
  const setProjectCategoryMutation = useMutation({
    mutationFn: ({ projectId, categoryId }: { projectId: number; categoryId: number | null }) =>
      apiFetch(`/api/projects/${projectId}`, {
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
        toast.success(`Role '${name}' updated`);
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
      assignUserRoleMutation.mutate(
        { userId: user.id, roleId: role.id },
        {
          onSuccess: () => toast.success(`Assigned '${role.name}'`),
        },
      );
    } else {
      removeUserRoleMutation.mutate(
        { userId: user.id, roleId: role.id },
        {
          onSuccess: () => toast.success(`Removed '${role.name}'`),
        },
      );
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
  // PROJECT items are derived from the single project-tab registry
  // (`lib/projectTabs.ts`) so adding a tab there automatically surfaces it in
  // the role editor with the right label, description, grant key, and
  // sub-rows. The ADMIN group is hand-curated since admin surfaces don't
  // share the tab abstraction.
  //
  // Both surfaces use PM-friendly labels ("Overview", "Timeline") rather
  // than raw keys; the keys still drive the grant — only the label is
  // humanized.
  interface PickerItem {
    label: string;
    grant: string;
    description: string;
    /** Optional sub-rows shown indented under the parent. When the parent's
     *  grant (typically a wildcard) is active, children render as covered
     *  and disabled — to customize, admin unchecks the parent first then
     *  picks specific child grants. */
    children?: { label: string; grant: string; description: string }[];
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
        // Mapped from PROJECT_TABS so the role editor reflects the live
        // project-tab registry — no duplicated labels/descriptions to drift.
        // The two write-side entries below are appended manually because they
        // gate creation surfaces (work items/sprints, PRD/roadmap AI) that
        // aren't tabs and so don't live in PROJECT_TABS. Cap keys live
        // outside the read groups' wildcards on purpose (`project.tracker_write`
        // is a sibling of `project.tracker`, not nested under it) so granting
        // read access doesn't auto-grant write.
        items: [
          ...PROJECT_TABS.map((tab) => ({
            label: tab.label,
            grant: tab.picker.grant,
            description: tab.picker.description,
            children: tab.picker.children ? [...tab.picker.children] : undefined,
          })),
          {
            label: 'Manage items & sprints',
            grant: 'project.tracker_write',
            description: 'Create, edit, and delete work items and sprints',
          },
          {
            label: 'AI Generators',
            grant: 'project.ai.write',
            description: 'Run PRD analyzer and roadmap parser (write)',
          },
          {
            label: 'Create new projects',
            grant: 'project.create',
            description: 'Create new projects from the home page (write)',
          },
          {
            label: 'Assign personal tasks to project',
            grant: 'project.assign_personal_task',
            description: 'Convert a personal task into a project ticket (write)',
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
            grant: 'admin.dashboard',
            description: 'Admin dashboard summary',
          },
          {
            label: 'Employees',
            grant: 'admin.employees',
            description: 'Manage employees',
          },
          {
            label: 'Projects',
            grant: 'admin.projects',
            description: 'Manage projects from admin',
          },
          {
            label: 'Users',
            grant: 'admin.users',
            description: 'Manage users and role assignments',
          },
          {
            label: 'Roles',
            grant: 'admin.roles',
            description: 'Manage roles and capability grants',
          },
        ],
      },
    ],
    [],
  );

  /** Strict "is this exact grant or a wildcard ancestor in the grant set?"
   *  check. Sibling sub-caps and descendants do NOT count.
   *
   *  This is the LEAF check — for items that have children (or for groups),
   *  use `isItemEffectivelyChecked` below which also returns true when
   *  every child is effectively checked.
   */
  const isItemChecked = (grant: string, grants: string[]): boolean => {
    if (grants.includes('*')) return true;
    if (grants.includes(grant)) return true;
    for (const g of grants) {
      if (!g.endsWith('.*')) continue;
      const prefix = g.slice(0, -2);
      // grant is covered when it equals the wildcard's prefix or is a
      // descendant. e.g. grant='project.pm.*' is covered by g='project.*'
      // because 'project.pm.*' starts with 'project.'.
      if (grant === prefix || grant.startsWith(prefix + '.')) return true;
    }
    return false;
  };

  /** Recursive "effectively checked" — used for the display state of any
   *  catalog node (group wildcard, top-level item, or child item).
   *
   *  Returns true when:
   *    - The grant is exactly in `grants` or covered by a wildcard ancestor
   *      (strict path — same as `isItemChecked`), OR
   *    - The node has children AND every child is effectively checked
   *      (auto-promote path — e.g. all 3 PM sub-rows checked → "Project
   *      Manager" parent shows checked; all top-level project items
   *      checked → "Grant all Project" shows checked).
   *
   *  Toggle logic uses this same predicate so clicking a parent that's
   *  "checked because all children are" cleanly sweeps everything under it.
   */
  type CatalogNode = { grant: string; children?: readonly { grant: string }[] };

  const isItemEffectivelyChecked = (node: CatalogNode, grants: string[]): boolean => {
    if (isItemChecked(node.grant, grants)) return true;
    if (!node.children || node.children.length === 0) return false;
    return node.children.every((c) => isItemEffectivelyChecked(c, grants));
  };

  /** Toggle a catalog item.
   *
   *  Uses the EFFECTIVE checked state — so a parent that's showing checked
   *  only because every child is granted will, on click, sweep those
   *  children. Same shape works for the group wildcard ("Grant all Project")
   *  when all top-level items are individually granted.
   *
   *  Uncheck: remove the exact grant; for wildcards, also sweep every
   *  explicit sub-cap underneath. This single sweep handles both the
   *  "wildcard directly granted" and "all children granted" auto-promote
   *  paths because both end up with grants under the wildcard prefix.
   *
   *  Check: add the grant; for wildcards, sweep redundant explicit sub-caps
   *  underneath since they're now covered. Keeps `grants` minimal.
   */
  const toggleCatalogItem = (node: CatalogNode) => {
    const { grant } = node;
    setRoleForm((f) => {
      const grants = f.capability_keys;
      const checked = isItemEffectivelyChecked(node, grants);
      if (checked) {
        let isUnderRemoved: (g: string) => boolean;
        if (grant.endsWith('.*')) {
          const prefix = grant.slice(0, -2);
          isUnderRemoved = (g) => g === grant || g === prefix || g.startsWith(prefix + '.');
        } else {
          isUnderRemoved = (g) => g === grant;
        }
        return { ...f, capability_keys: grants.filter((g) => !isUnderRemoved(g)) };
      }
      let cleaned: string[];
      if (grant.endsWith('.*')) {
        const prefix = grant.slice(0, -2);
        cleaned = grants.filter((g) => g !== prefix && !g.startsWith(prefix + '.'));
      } else {
        cleaned = grants.slice();
      }
      return { ...f, capability_keys: [...cleaned, grant] };
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
                />
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
        toggleCatalogItem={toggleCatalogItem}
        isItemChecked={isItemChecked}
        isItemEffectivelyChecked={isItemEffectivelyChecked}
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
                <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
                  <div>
                    <h2 className="text-lg font-bold text-white">Edit Roles</h2>
                    <p className="text-xs text-[#737373] mt-0.5">{targetUser.name}</p>
                  </div>
                  <button
                    onClick={() => setOpenRoleDropdown(null)}
                    className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-5 space-y-2 overflow-y-auto">
                  {roles.length === 0 ? (
                    <p className="text-sm text-[#737373] text-center py-6">No roles defined yet.</p>
                  ) : (
                    roles.map((role) => {
                      const isChecked = userRoleNames.has(role.name);
                      return (
                        <label
                          key={role.id}
                          className="flex items-center gap-3 p-3 rounded-lg hover:bg-[rgba(255,255,255,0.02)] cursor-pointer transition border border-transparent hover:border-[rgba(255,255,255,0.04)]"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) =>
                              handleToggleUserRoleById(targetUser, role, e.target.checked)
                            }
                            className="w-5 h-5 rounded cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-white font-medium">
                                {toPascalCase(role.name)}
                              </span>
                              {role.is_system && (
                                <span className="text-[9px] uppercase tracking-wide text-[#737373] px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.04)]">
                                  System
                                </span>
                              )}
                            </div>
                            {role.description && (
                              <p className="text-xs text-[#737373] mt-0.5 truncate">
                                {role.description}
                              </p>
                            )}
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
                <div className="flex justify-end gap-2 p-5 border-t border-[rgba(255,255,255,0.05)]">
                  <button
                    onClick={() => setOpenRoleDropdown(null)}
                    className="px-4 py-2 rounded-lg text-[#737373] hover:bg-[rgba(255,255,255,0.05)] transition"
                  >
                    Done
                  </button>
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
