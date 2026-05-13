import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import {
  Users,
  FolderKanban,
  Ticket,
  Calendar,
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  ArrowLeft,
  BarChart3,
  Github,
  Settings,
  ExternalLink,
  Shield,
  UserCog,
  Mail,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  TrendingUp,
  Search,
  ArrowUpDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast, Toaster } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';

interface Employee {
  id: number;
  name: string;
  email: string;
  github_username: string | null;
  avatar_url: string | null;
  specialization: string | null;
  created_at: string;
  updated_at: string;
  project_count: number;
  assigned_items_count: number;
}

interface CapacityTicket {
  id: number;
  key: string;
  title: string;
  status: string;
  priority: string;
  project_id: number;
  project_name: string | null;
  estimated_hours: number;
  logged_hours: number;
  remaining_hours: number;
  started_at: string | null;
  last_assigned_at: string | null;
  completed_at: string | null;
  counted_hours: number;
  counted_basis: string;
}

interface DeveloperCapacity {
  developer_id: number;
  developer_name: string;
  developer_email: string;
  avatar_url: string | null;
  project_count: number;
  this_week_in_progress_hours: number;
  this_week_in_review_hours: number;
  this_week_done_hours: number;
  this_week_capacity_used: number;
  this_week_remaining_capacity: number;
  week_start?: string;
  week_end?: string;
  tickets?: CapacityTicket[];
  specialization: string | null;
}

interface User {
  id: number;
  email: string;
  name: string;
  role: string; // Comma-separated roles
  is_active: boolean;
  is_first_login: boolean;
  created_at: string;
  last_login_at: string | null;
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
}

interface DashboardStats {
  total_employees: number;
  total_projects: number;
  total_tickets: number;
  active_sprints: number;
  tickets_by_status: Record<string, number>;
  tickets_by_priority: Record<string, number>;
}

type AdminTab =
  | 'dashboard'
  | 'employees'
  | 'projects'
  | 'users'
  | 'developers-capacity'
  | 'custom-restrictions';
const VALID_ADMIN_TABS: AdminTab[] = [
  'dashboard',
  'employees',
  'projects',
  'users',
  'developers-capacity',
  'custom-restrictions',
];

const PROJECT_COLOR_PALETTE = [
  '#E0B954',
  '#A78BFA',
  '#34D399',
  '#60A5FA',
  '#F97316',
  '#EC4899',
  '#10B981',
  '#F59E0B',
  '#94A3B8',
  '#EF4444',
];
const projectColor = (projectId: number) =>
  PROJECT_COLOR_PALETTE[Math.abs(projectId) % PROJECT_COLOR_PALETTE.length];

const statusBadgeColor = (status: string) => {
  if (status === 'in_progress') return '#E0B954';
  if (status === 'in_review') return '#A78BFA';
  if (status === 'done') return '#34D399';
  if (status === 'blocked') return '#EF4444';
  return '#737373';
};

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

  const statsQuery = useQuery<DashboardStats>({
    queryKey: ['admin', 'stats'],
    queryFn: () => apiFetch<DashboardStats>('/api/admin/stats'),
  });
  const stats = statsQuery.data ?? null;

  const employeesQuery = useQuery<Employee[]>({
    queryKey: ['admin', 'employees'],
    queryFn: () => apiFetch<Employee[]>('/api/admin/employees'),
  });
  // useMemo keeps the array reference stable across renders so the
  // useMemo hooks downstream (filtered/sorted views) don't bust their
  // caches every render.
  const employees = useMemo(() => employeesQuery.data ?? [], [employeesQuery.data]);

  const capacityQuery = useQuery<DeveloperCapacity[]>({
    queryKey: ['admin', 'developers-capacity'],
    queryFn: () => apiFetch<DeveloperCapacity[]>('/api/admin/developers/capacity'),
  });
  const developerCapacities = useMemo(() => capacityQuery.data ?? [], [capacityQuery.data]);

  const projectsQuery = useQuery<Project[]>({
    queryKey: ['admin', 'projects'],
    queryFn: () => apiFetch<Project[]>('/api/admin/projects'),
  });
  const projects = projectsQuery.data ?? [];

  const usersQuery = useQuery<User[]>({
    queryKey: ['admin', 'users'],
    queryFn: () => apiFetch<User[]>('/api/auth/admin/users'),
  });
  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);

  const restrictionsQuery = useQuery<any[]>({
    queryKey: ['admin', 'custom-restrictions'],
    queryFn: () => apiFetch<any[]>('/api/auth/admin/custom-restrictions'),
  });
  const customRestrictions = restrictionsQuery.data ?? [];

  const loading =
    statsQuery.isLoading ||
    employeesQuery.isLoading ||
    capacityQuery.isLoading ||
    projectsQuery.isLoading ||
    usersQuery.isLoading ||
    restrictionsQuery.isLoading;

  const [expandedCapacityDevId, setExpandedCapacityDevId] = useState<number | null>(null);

  // Employees tab filters + sort
  type EmployeeSortKey = 'name' | 'projects' | 'assigned' | 'capacity';
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState<
    'all' | 'Available' | 'Moderate' | 'Busy'
  >('all');
  const [employeeSpecFilter, setEmployeeSpecFilter] = useState<string>('all');
  const [employeeSort, setEmployeeSort] = useState<{ key: EmployeeSortKey; dir: 'asc' | 'desc' }>({
    key: 'capacity',
    dir: 'desc',
  });

  const handleEmployeeSort = (key: EmployeeSortKey) => {
    setEmployeeSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' },
    );
  };

  // Users tab filters + sort
  type UsersSortKey = 'created' | 'name' | 'status' | 'last_login';
  const [usersRoleFilter, setUsersRoleFilter] = useState<string>('all');
  const [usersSort, setUsersSort] = useState<{ key: UsersSortKey; dir: 'asc' | 'desc' }>({
    key: 'created',
    dir: 'desc',
  });

  const handleUsersSort = (key: UsersSortKey) => {
    setUsersSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' },
    );
  };

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

  const filteredEmployeeRows = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    const rows = employees.map((emp) => {
      const cap = developerCapacities.find((d) => d.developer_id === emp.id);
      const used = cap?.this_week_capacity_used ?? 0;
      const inProgress = cap?.this_week_in_progress_hours ?? 0;
      const inReview = cap?.this_week_in_review_hours ?? 0;
      const done = cap?.this_week_done_hours ?? 0;
      const remaining = Math.max(0, WEEKLY_CAPACITY_HRS - used);
      const status: 'Available' | 'Moderate' | 'Busy' =
        remaining >= 10 ? 'Available' : remaining > 0 ? 'Moderate' : 'Busy';
      return { emp, used, inProgress, inReview, done, remaining, status };
    });

    const filtered = rows.filter((r) => {
      if (q && !(r.emp.name.toLowerCase().includes(q) || r.emp.email.toLowerCase().includes(q)))
        return false;
      if (employeeStatusFilter !== 'all' && r.status !== employeeStatusFilter) return false;
      if (employeeSpecFilter !== 'all' && (r.emp.specialization || '') !== employeeSpecFilter)
        return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      switch (employeeSort.key) {
        case 'name':
          av = a.emp.name.toLowerCase();
          bv = b.emp.name.toLowerCase();
          break;
        case 'projects':
          av = a.emp.project_count;
          bv = b.emp.project_count;
          break;
        case 'assigned':
          av = a.emp.assigned_items_count;
          bv = b.emp.assigned_items_count;
          break;
        case 'capacity':
        default:
          av = a.used;
          bv = b.used;
          break;
      }
      if (av < bv) return employeeSort.dir === 'asc' ? -1 : 1;
      if (av > bv) return employeeSort.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [
    employees,
    developerCapacities,
    employeeSearch,
    employeeStatusFilter,
    employeeSpecFilter,
    employeeSort,
  ]);

  useAuth(); // keeps auth guard active; token read from localStorage by apiFetch

  const availableUserRoles = useMemo(() => {
    const set = new Set<string>();
    users.forEach((u) =>
      u.role.split(',').forEach((r) => {
        const trimmed = r.trim();
        if (trimmed) set.add(trimmed);
      }),
    );
    return Array.from(set).sort();
  }, [users]);

  const visibleUsers = useMemo(() => {
    const filtered =
      usersRoleFilter === 'all'
        ? users
        : users.filter((u) =>
            u.role
              .split(',')
              .map((r) => r.trim())
              .includes(usersRoleFilter),
          );

    return [...filtered].sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      switch (usersSort.key) {
        case 'name':
          av = a.name.toLowerCase();
          bv = b.name.toLowerCase();
          break;
        case 'status':
          av = a.is_active ? 1 : 0;
          bv = b.is_active ? 1 : 0;
          break;
        case 'last_login':
          av = a.last_login_at ? new Date(a.last_login_at).getTime() : 0;
          bv = b.last_login_at ? new Date(b.last_login_at).getTime() : 0;
          break;
        case 'created':
        default:
          av = new Date(a.created_at).getTime();
          bv = new Date(b.created_at).getTime();
          break;
      }
      if (av < bv) return usersSort.dir === 'asc' ? -1 : 1;
      if (av > bv) return usersSort.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [users, usersRoleFilter, usersSort]);

  // Custom restrictions state
  const [showRestrictionModal, setShowRestrictionModal] = useState(false);
  const [editingRestriction, setEditingRestriction] = useState<any | null>(null);
  const [restrictionForm, setRestrictionForm] = useState({
    name: '',
    tab_name: '',
    subsection: '',
  });

  // User restrictions management state
  const [showUserRestrictionsModal, setShowUserRestrictionsModal] = useState(false);
  const [selectedUserForRestrictions, setSelectedUserForRestrictions] = useState<User | null>(null);

  // Role dropdown state
  const [openRoleDropdown, setOpenRoleDropdown] = useState<number | null>(null);

  // Helper function to convert role to Pascal Case
  const toPascalCase = (str: string): string => {
    return str
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  };

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

  const handleCreateEmployee = () => {
    setEditingEmployee(null);
    setEmployeeForm({ name: '', email: '', github_username: '', specialization: '' });
    setShowEmployeeModal(true);
  };

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
      queryClient.invalidateQueries({ queryKey: ['admin', 'employees'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'developers-capacity'] });
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to save employee'),
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
      queryClient.invalidateQueries({ queryKey: ['admin', 'employees'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'developers-capacity'] });
    },
    onError: () => toast.error('Failed to delete employee'),
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
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
    },
    onError: () => toast.error('Failed to update GitHub settings'),
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
      queryClient.invalidateQueries({ queryKey: ['project', selectedProjectForMembers?.id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to add member'),
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
      queryClient.invalidateQueries({ queryKey: ['project', selectedProjectForMembers?.id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to remove member'),
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
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  const handleRoleToggle = (role: string) => {
    setUserForm((f) => {
      const roles = f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role];
      return { ...f, roles: roles.length > 0 ? roles : ['developer'] };
    });
  };

  const createUserMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ temporary_password: string }>('/api/auth/admin/create-user', {
        method: 'POST',
        body: JSON.stringify({ ...userForm, role: userForm.roles.join(',') }),
      }),
    onSuccess: (data) => {
      toast.success('User created successfully!');
      setGeneratedPassword(data.temporary_password);
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to create user'),
  });

  const handleSaveUser = () => {
    if (!userForm.email.trim() || !userForm.name.trim()) {
      toast.error('Email and name are required');
      return;
    }
    createUserMutation.mutate();
  };

  const toggleUserRoleMutation = useMutation({
    mutationFn: ({ userId, newRole }: { userId: number; newRole: string }) =>
      apiFetch<void>(`/api/auth/admin/users/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole }),
      }),
    onSuccess: () => {
      toast.success('User roles updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: () => toast.error('Failed to update role'),
  });

  const handleToggleUserRole = (user: User, roleToToggle: string) => {
    const currentRoles = user.role.split(',').map((r) => r.trim());
    let newRoles: string[];
    if (currentRoles.includes(roleToToggle)) {
      newRoles = currentRoles.filter((r) => r !== roleToToggle);
      if (newRoles.length === 0) newRoles = ['developer'];
    } else {
      newRoles = [...currentRoles, roleToToggle];
    }
    toggleUserRoleMutation.mutate({ userId: user.id, newRole: newRoles.join(',') });
  };

  // Custom Restrictions Handlers
  const handleCreateRestriction = () => {
    setEditingRestriction(null);
    setRestrictionForm({ name: '', tab_name: '', subsection: '' });
    setShowRestrictionModal(true);
  };

  const handleEditRestriction = (restriction: any) => {
    setEditingRestriction(restriction);
    setRestrictionForm({
      name: restriction.name,
      tab_name: restriction.tab_name,
      subsection: restriction.subsection,
    });
    setShowRestrictionModal(true);
  };

  const saveRestrictionMutation = useMutation({
    mutationFn: () => {
      const url = editingRestriction
        ? `/api/auth/admin/custom-restrictions/${editingRestriction.id}`
        : `/api/auth/admin/custom-restrictions`;
      const method = editingRestriction ? 'PUT' : 'POST';
      return apiFetch<any>(url, { method, body: JSON.stringify(restrictionForm) });
    },
    onSuccess: () => {
      toast.success(editingRestriction ? 'Restriction updated!' : 'Restriction created!');
      setShowRestrictionModal(false);
      queryClient.invalidateQueries({ queryKey: ['admin', 'custom-restrictions'] });
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to save restriction'),
  });

  const handleSaveRestriction = () => {
    if (!restrictionForm.name.trim() || !restrictionForm.tab_name || !restrictionForm.subsection) {
      toast.error('All fields are required');
      return;
    }
    saveRestrictionMutation.mutate();
  };

  const deleteRestrictionMutation = useMutation({
    mutationFn: (restrictionId: number) =>
      apiFetch<void>(`/api/auth/admin/custom-restrictions/${restrictionId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Restriction deleted!');
      queryClient.invalidateQueries({ queryKey: ['admin', 'custom-restrictions'] });
    },
    onError: () => toast.error('Failed to delete restriction'),
  });

  const handleDeleteRestriction = (restrictionId: number) => {
    if (!confirm('Are you sure you want to delete this custom restriction?')) return;
    deleteRestrictionMutation.mutate(restrictionId);
  };

  // User Restrictions Management Handlers
  const userRestrictionsQuery = useQuery<any[]>({
    queryKey: ['admin', 'user-restrictions', selectedUserForRestrictions?.id],
    queryFn: () =>
      apiFetch<any[]>(
        `/api/auth/admin/users/${selectedUserForRestrictions!.id}/custom-restrictions`,
      ),
    enabled: !!selectedUserForRestrictions,
  });
  const userRestrictionsList: number[] = (userRestrictionsQuery.data ?? []).map((r: any) => r.id);
  const userRestrictionsLoading = userRestrictionsQuery.isLoading;

  const handleOpenUserRestrictionsModal = (user: User) => {
    setSelectedUserForRestrictions(user);
    setShowUserRestrictionsModal(true);
  };

  const toggleUserRestrictionMutation = useMutation({
    mutationFn: ({ restrictionId, isChecked }: { restrictionId: number; isChecked: boolean }) => {
      if (!selectedUserForRestrictions) throw new Error('No user selected');
      const method = isChecked ? 'POST' : 'DELETE';
      return apiFetch<void>(
        `/api/auth/admin/users/${selectedUserForRestrictions.id}/custom-restrictions/${restrictionId}`,
        { method },
      );
    },
    onSuccess: (_data, { isChecked }) => {
      toast.success(isChecked ? 'Restriction assigned!' : 'Restriction removed!');
      queryClient.invalidateQueries({
        queryKey: ['admin', 'user-restrictions', selectedUserForRestrictions?.id],
      });
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to update restriction'),
  });

  const handleToggleUserRestriction = (restrictionId: number, isChecked: boolean) => {
    toggleUserRestrictionMutation.mutate({ restrictionId, isChecked });
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
              { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
              { id: 'employees', label: 'Employees', icon: Users },
              { id: 'projects', label: 'Projects', icon: FolderKanban },
              { id: 'users', label: 'Users', icon: Shield },
              { id: 'custom-restrictions', label: 'Restrictions', icon: Settings },
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
            {/* Dashboard Tab */}
            {activeTab === 'dashboard' &&
              stats &&
              (() => {
                const statusColor = (s: string) => {
                  const key = s.toLowerCase();
                  if (key === 'done' || key === 'completed' || key === 'closed') return '#34D399';
                  if (key === 'in_progress' || key === 'in progress') return '#E0B954';
                  if (key === 'in_review' || key === 'in review' || key === 'review')
                    return '#A78BFA';
                  if (key === 'blocked') return '#EF4444';
                  if (key === 'cancelled' || key === 'canceled' || key === 'wontfix')
                    return '#525252';
                  if (key === 'backlog') return '#64748B';
                  if (key === 'todo' || key === 'to_do' || key === 'to do') return '#94A3B8';
                  if (key === 'open' || key === 'new') return '#60A5FA';
                  return '#737373';
                };
                const priorityColor = (p: string) => {
                  const key = p.toLowerCase();
                  if (key === 'critical') return '#EF4444';
                  if (key === 'high') return '#F97316';
                  if (key === 'medium') return '#F59E0B';
                  if (key === 'low') return '#E0B954';
                  return '#737373';
                };
                const priorityOrder = ['critical', 'high', 'medium', 'low'];
                const statusData = Object.entries(stats.tickets_by_status)
                  .map(([name, value]) => ({
                    name,
                    label: name.replace(/_/g, ' '),
                    value,
                    color: statusColor(name),
                  }))
                  .sort((a, b) => b.value - a.value);
                const priorityData = Object.entries(stats.tickets_by_priority)
                  .map(([name, value]) => ({
                    name,
                    label: name.charAt(0).toUpperCase() + name.slice(1),
                    value,
                    color: priorityColor(name),
                  }))
                  .sort((a, b) => {
                    const ai = priorityOrder.indexOf(a.name.toLowerCase());
                    const bi = priorityOrder.indexOf(b.name.toLowerCase());
                    if (ai === -1 && bi === -1) return 0;
                    if (ai === -1) return 1;
                    if (bi === -1) return -1;
                    return ai - bi;
                  });

                const kpis: Array<{
                  label: string;
                  value: number;
                  icon: typeof Users;
                  color: string;
                  tab?: AdminTab;
                }> = [
                  {
                    label: 'Total Employees',
                    value: stats.total_employees,
                    icon: Users,
                    color: '#E0B954',
                    tab: 'employees',
                  },
                  {
                    label: 'Total Projects',
                    value: stats.total_projects,
                    icon: FolderKanban,
                    color: '#E0B954',
                    tab: 'projects',
                  },
                  {
                    label: 'Total Tickets',
                    value: stats.total_tickets,
                    icon: Ticket,
                    color: '#F59E0B',
                  },
                  {
                    label: 'Active Sprints',
                    value: stats.active_sprints,
                    icon: Calendar,
                    color: '#EC4899',
                  },
                ];

                return (
                  <div className="space-y-6">
                    {/* Stats Cards */}
                    <div className="grid grid-cols-4 gap-4">
                      {kpis.map((stat, i) => {
                        const clickable = !!stat.tab;
                        const Wrapper: any = clickable ? 'button' : 'div';
                        return (
                          <Wrapper
                            key={i}
                            {...(clickable
                              ? {
                                  onClick: () => setActiveTab(stat.tab as AdminTab),
                                  type: 'button',
                                  title: `Go to ${stat.label.replace('Total ', '')} tab`,
                                }
                              : {})}
                            className={`text-left bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl p-5 transition-colors ${
                              clickable
                                ? 'cursor-pointer hover:border-[rgba(224,185,84,0.3)] hover:bg-[rgba(255,255,255,0.015)] focus:outline-none focus:ring-1 focus:ring-[#E0B954]'
                                : ''
                            }`}
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div
                                className="p-2 rounded-lg"
                                style={{ backgroundColor: `${stat.color}20` }}
                              >
                                <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
                              </div>
                              {clickable && <ChevronRight className="w-4 h-4 text-[#737373]" />}
                            </div>
                            <div className="text-2xl font-bold text-white tabular-nums">
                              {stat.value}
                            </div>
                            <div className="text-sm text-[#737373]">{stat.label}</div>
                          </Wrapper>
                        );
                      })}
                    </div>

                    {/* Charts */}
                    <div className="grid grid-cols-2 gap-6">
                      {/* Tickets by Status — donut */}
                      <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl p-5">
                        <h3 className="text-lg font-semibold text-white mb-4">Tickets by Status</h3>
                        {statusData.length === 0 || stats.total_tickets === 0 ? (
                          <div className="text-sm text-[#737373] py-10 text-center">
                            No ticket data yet.
                          </div>
                        ) : (
                          <div className="flex items-center gap-5">
                            <div
                              className="relative flex-shrink-0"
                              style={{ width: 180, height: 180 }}
                            >
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={statusData}
                                    dataKey="value"
                                    nameKey="label"
                                    innerRadius={55}
                                    outerRadius={80}
                                    paddingAngle={2}
                                    stroke="none"
                                  >
                                    {statusData.map((d) => (
                                      <Cell key={d.name} fill={d.color} />
                                    ))}
                                  </Pie>
                                  <Tooltip
                                    contentStyle={{
                                      backgroundColor: '#121212',
                                      border: '1px solid rgba(255,255,255,0.08)',
                                      borderRadius: 8,
                                      fontSize: 12,
                                      textTransform: 'capitalize',
                                    }}
                                    itemStyle={{ color: '#a3a3a3' }}
                                    wrapperStyle={{ outline: 'none', zIndex: 50 }}
                                    formatter={(value: number, name: string) => [
                                      `${value} (${Math.round((value / stats.total_tickets) * 100)}%)`,
                                      name,
                                    ]}
                                  />
                                </PieChart>
                              </ResponsiveContainer>
                              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <div className="text-2xl font-bold text-white tabular-nums">
                                  {stats.total_tickets}
                                </div>
                                <div className="text-[10px] text-[#737373] uppercase tracking-wider">
                                  Total
                                </div>
                              </div>
                            </div>
                            <ul className="flex-1 space-y-1.5 min-w-0">
                              {statusData.map((d) => {
                                const pct = Math.round((d.value / stats.total_tickets) * 100);
                                return (
                                  <li key={d.name} className="flex items-center gap-2 text-xs">
                                    <span
                                      className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                                      style={{ backgroundColor: d.color }}
                                    />
                                    <span className="text-[#a3a3a3] capitalize truncate">
                                      {d.label}
                                    </span>
                                    <span className="ml-auto text-[#737373] tabular-nums">
                                      {d.value}
                                    </span>
                                    <span className="text-[#525252] tabular-nums w-9 text-right">
                                      {pct}%
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Tickets by Priority — bar chart */}
                      <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl p-5">
                        <h3 className="text-lg font-semibold text-white mb-4">
                          Tickets by Priority
                        </h3>
                        {priorityData.length === 0 || stats.total_tickets === 0 ? (
                          <div className="text-sm text-[#737373] py-10 text-center">
                            No ticket data yet.
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height={180}>
                            <BarChart
                              data={priorityData}
                              margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
                            >
                              <XAxis
                                dataKey="label"
                                tick={{ fill: '#a3a3a3', fontSize: 11 }}
                                axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                                tickLine={false}
                              />
                              <YAxis
                                tick={{ fill: '#737373', fontSize: 10 }}
                                axisLine={false}
                                tickLine={false}
                                allowDecimals={false}
                              />
                              <Tooltip
                                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                                contentStyle={{
                                  backgroundColor: '#121212',
                                  border: '1px solid rgba(255,255,255,0.08)',
                                  borderRadius: 8,
                                  fontSize: 12,
                                }}
                                labelStyle={{ color: '#fff', fontWeight: 600 }}
                                itemStyle={{ color: '#a3a3a3' }}
                                formatter={(value: number) => [`${value} tickets`, '']}
                              />
                              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                                {priorityData.map((d) => (
                                  <Cell key={d.name} fill={d.color} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

            {/* Employees Tab */}
            {activeTab === 'employees' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-semibold text-white">Team Members</h2>
                  <Button
                    onClick={handleCreateEmployee}
                    className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Employee
                  </Button>
                </div>

                {employees.length > 0 && (
                  <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl p-5 space-y-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-[#E0B954]" />
                          <h3 className="text-sm font-semibold text-white">
                            Team Capacity Overview
                          </h3>
                        </div>
                        <div className="text-xs text-[#737373] mt-1">
                          Week:{' '}
                          <span className="text-[#a3a3a3] font-mono">
                            {teamCapacity.weekStart
                              ? new Date(teamCapacity.weekStart).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : '—'}
                            {' → '}
                            {teamCapacity.weekEnd
                              ? new Date(teamCapacity.weekEnd).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : '—'}
                          </span>
                          <span className="ml-2 text-[#737373]">(Sat → Fri, UTC)</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {(
                          [
                            {
                              key: 'Available',
                              count: teamCapacity.counts.Available,
                              base: 'rgba(224,185,84',
                              text: '#E0B954',
                            },
                            {
                              key: 'Moderate',
                              count: teamCapacity.counts.Moderate,
                              base: 'rgba(245,158,11',
                              text: '#F59E0B',
                            },
                            {
                              key: 'Busy',
                              count: teamCapacity.counts.Busy,
                              base: 'rgba(239,68,68',
                              text: '#EF4444',
                            },
                          ] as const
                        ).map((pill) => {
                          const active = employeeStatusFilter === pill.key;
                          return (
                            <button
                              key={pill.key}
                              onClick={() => setEmployeeStatusFilter(active ? 'all' : pill.key)}
                              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${active ? 'ring-1 ring-offset-0' : 'hover:opacity-90'}`}
                              style={{
                                backgroundColor: active
                                  ? `${pill.base},0.25)`
                                  : `${pill.base},0.12)`,
                                color: pill.text,
                                borderColor: `${pill.base},${active ? '0.45' : '0.2'})`,
                              }}
                              title={active ? 'Clear filter' : `Show only ${pill.key} developers`}
                            >
                              {pill.count} {pill.key}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* KPI tiles */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="rounded-lg p-3 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]">
                        <div className="text-[10px] uppercase tracking-wider text-[#737373]">
                          Headcount
                        </div>
                        <div className="text-xl font-bold text-white tabular-nums mt-1">
                          {teamCapacity.perDev.length}
                        </div>
                      </div>
                      <div className="rounded-lg p-3 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]">
                        <div className="text-[10px] uppercase tracking-wider text-[#737373]">
                          Hours Used
                        </div>
                        <div className="text-xl font-bold text-white tabular-nums mt-1">
                          {teamCapacity.totalUsed}
                          <span className="text-sm text-[#737373] font-normal">
                            {' '}
                            / {teamCapacity.totalCapacity}h
                          </span>
                        </div>
                      </div>
                      <div className="rounded-lg p-3 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]">
                        <div className="text-[10px] uppercase tracking-wider text-[#737373]">
                          Utilization
                        </div>
                        <div
                          className={`text-xl font-bold tabular-nums mt-1 ${
                            teamCapacity.utilization >= 90
                              ? 'text-[#EF4444]'
                              : teamCapacity.utilization >= 70
                                ? 'text-[#F59E0B]'
                                : 'text-[#34D399]'
                          }`}
                        >
                          {teamCapacity.utilization}%
                        </div>
                      </div>
                      <div className="rounded-lg p-3 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]">
                        <div className="text-[10px] uppercase tracking-wider text-[#737373]">
                          Slack Remaining
                        </div>
                        <div className="text-xl font-bold text-white tabular-nums mt-1">
                          {teamCapacity.totalRemaining}h
                        </div>
                      </div>
                    </div>

                    {/* Team-wide stacked bar */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-[#737373] mb-1.5">
                        <span>Team workload split</span>
                        <span className="font-mono tabular-nums">
                          {teamCapacity.totalUsed}h of {teamCapacity.totalCapacity}h
                        </span>
                      </div>
                      <div className="h-3 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden flex">
                        <div
                          className="h-full bg-[#E0B954]"
                          style={{
                            width: `${teamCapacity.totalCapacity ? (teamCapacity.totalInProgress / teamCapacity.totalCapacity) * 100 : 0}%`,
                          }}
                          title={`In progress: ${teamCapacity.totalInProgress}h`}
                        />
                        <div
                          className="h-full bg-[#A78BFA]"
                          style={{
                            width: `${teamCapacity.totalCapacity ? (teamCapacity.totalInReview / teamCapacity.totalCapacity) * 100 : 0}%`,
                          }}
                          title={`In review: ${teamCapacity.totalInReview}h`}
                        />
                        <div
                          className="h-full bg-[#34D399]"
                          style={{
                            width: `${teamCapacity.totalCapacity ? (teamCapacity.totalDone / teamCapacity.totalCapacity) * 100 : 0}%`,
                          }}
                          title={`Done: ${teamCapacity.totalDone}h`}
                        />
                      </div>
                      <div className="text-[10px] text-[#737373] mt-1.5 flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-sm bg-[#E0B954]" />
                          In progress · {teamCapacity.totalInProgress}h
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-sm bg-[#A78BFA]" />
                          In review · {teamCapacity.totalInReview}h
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-sm bg-[#34D399]" />
                          Done · {teamCapacity.totalDone}h
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-sm bg-[rgba(255,255,255,0.15)]" />
                          Remaining · {teamCapacity.totalRemaining}h
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Search + filter bar */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[220px]">
                    <Search className="w-3.5 h-3.5 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <Input
                      value={employeeSearch}
                      onChange={(e) => setEmployeeSearch(e.target.value)}
                      placeholder="Search by name or email..."
                      className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-9 pl-8 text-sm"
                    />
                  </div>
                  {availableSpecs.length > 0 && (
                    <select
                      value={employeeSpecFilter}
                      onChange={(e) => setEmployeeSpecFilter(e.target.value)}
                      className="h-9 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
                      title="Filter by specialization"
                    >
                      <option value="all">All specializations</option>
                      {availableSpecs.map((s) => (
                        <option key={s} value={s} className="capitalize">
                          {s}
                        </option>
                      ))}
                    </select>
                  )}
                  <select
                    value={employeeStatusFilter}
                    onChange={(e) =>
                      setEmployeeStatusFilter(e.target.value as typeof employeeStatusFilter)
                    }
                    className="h-9 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
                    title="Filter by capacity status"
                  >
                    <option value="all">All statuses</option>
                    <option value="Available">Available</option>
                    <option value="Moderate">Moderate</option>
                    <option value="Busy">Busy</option>
                  </select>
                  {(employeeSearch ||
                    employeeStatusFilter !== 'all' ||
                    employeeSpecFilter !== 'all') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEmployeeSearch('');
                        setEmployeeStatusFilter('all');
                        setEmployeeSpecFilter('all');
                      }}
                      className="h-9 text-xs text-[#737373] hover:text-white rounded-xl px-3"
                    >
                      Clear filters
                    </Button>
                  )}
                  <div className="ml-auto text-xs text-[#737373]">
                    {filteredEmployeeRows.length} of {employees.length}
                  </div>
                </div>

                <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[rgba(255,255,255,0.05)]">
                        {(
                          [
                            { key: 'name' as const, label: 'Name', sortable: true, align: 'left' },
                            { key: null, label: 'Email', sortable: false, align: 'left' },
                            { key: null, label: 'GitHub', sortable: false, align: 'left' },
                            {
                              key: 'projects' as const,
                              label: 'Projects',
                              sortable: true,
                              align: 'left',
                            },
                            {
                              key: 'assigned' as const,
                              label: 'Assigned',
                              sortable: true,
                              align: 'left',
                            },
                            {
                              key: 'capacity' as const,
                              label: 'Capacity',
                              sortable: true,
                              align: 'left',
                            },
                            { key: null, label: 'Actions', sortable: false, align: 'right' },
                          ] as const
                        ).map((col, i) => {
                          const isActive = col.sortable && col.key && employeeSort.key === col.key;
                          const ArrowIcon = isActive
                            ? employeeSort.dir === 'asc'
                              ? ChevronUp
                              : ChevronDown
                            : ArrowUpDown;
                          const baseCls = `text-xs font-medium text-[#737373] uppercase tracking-wider px-5 py-3 ${col.align === 'right' ? 'text-right' : 'text-left'}`;
                          if (!col.sortable || !col.key) {
                            return (
                              <th key={i} className={baseCls}>
                                {col.label}
                              </th>
                            );
                          }
                          return (
                            <th key={i} className={baseCls}>
                              <button
                                onClick={() => handleEmployeeSort(col.key as EmployeeSortKey)}
                                className={`inline-flex items-center gap-1 hover:text-white transition-colors ${isActive ? 'text-white' : ''}`}
                                title={`Sort by ${col.label}`}
                              >
                                {col.label}
                                <ArrowIcon
                                  className={`w-3 h-3 ${isActive ? 'opacity-100' : 'opacity-40'}`}
                                />
                              </button>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEmployeeRows.map(({ emp }) => {
                        const devCapacity = developerCapacities.find(
                          (d) => d.developer_id === emp.id,
                        );
                        const capacityUsed = devCapacity?.this_week_capacity_used ?? 0;
                        const capacityPercentage = Math.round((capacityUsed / 40) * 100);
                        const remaining = devCapacity?.this_week_remaining_capacity ?? 40;
                        const capacityStatus =
                          remaining >= 10 ? 'Available' : remaining > 0 ? 'Moderate' : 'Busy';
                        const isExpanded = expandedCapacityDevId === emp.id;
                        const tickets = devCapacity?.tickets ?? [];

                        // Group tickets by project for inline distribution + expanded view
                        const projectGroupsMap = tickets.reduce<
                          Record<
                            number,
                            {
                              projectId: number;
                              projectName: string;
                              tickets: CapacityTicket[];
                              total: number;
                            }
                          >
                        >((acc, t) => {
                          const pid = t.project_id;
                          if (!acc[pid])
                            acc[pid] = {
                              projectId: pid,
                              projectName: t.project_name || `Project ${pid}`,
                              tickets: [],
                              total: 0,
                            };
                          acc[pid].tickets.push(t);
                          acc[pid].total += t.counted_hours;
                          return acc;
                        }, {});
                        const projectsByHours = Object.values(projectGroupsMap).sort(
                          (a, b) => b.total - a.total,
                        );

                        return (
                          <React.Fragment key={emp.id}>
                            <tr
                              className={`border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] ${isExpanded ? 'bg-[rgba(255,255,255,0.015)]' : ''}`}
                            >
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-[rgba(224,185,84,0.2)] flex items-center justify-center text-sm font-medium text-[#E0B954]">
                                    {emp.name.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="text-sm font-medium text-white">{emp.name}</div>
                                    {emp.specialization && (
                                      <div className="text-xs text-[#737373] capitalize">
                                        {emp.specialization}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-4 text-sm text-[#a3a3a3]">{emp.email}</td>
                              <td className="px-5 py-4 text-sm text-[#737373]">
                                {emp.github_username || '-'}
                              </td>
                              <td className="px-5 py-4 text-sm text-[#a3a3a3]">
                                {emp.project_count}
                              </td>
                              <td className="px-5 py-4 text-sm text-[#a3a3a3]">
                                {emp.assigned_items_count}
                              </td>
                              <td
                                className="px-5 py-4 cursor-pointer hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                                onClick={() => setExpandedCapacityDevId(isExpanded ? null : emp.id)}
                                title="Click to see ticket-level breakdown"
                              >
                                <div className="flex items-center gap-2">
                                  {isExpanded ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-[#737373] flex-shrink-0" />
                                  ) : (
                                    <ChevronRight className="w-3.5 h-3.5 text-[#737373] flex-shrink-0" />
                                  )}
                                  <div className="flex-1 min-w-0 max-w-xs">
                                    <div className="h-2 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden flex">
                                      {projectsByHours.map((p) => (
                                        <div
                                          key={p.projectId}
                                          className="h-full"
                                          style={{
                                            width: `${Math.min(100, (p.total / 40) * 100)}%`,
                                            backgroundColor: projectColor(p.projectId),
                                          }}
                                          title={`${p.projectName}: ${p.total}h (${p.tickets.length} ticket${p.tickets.length === 1 ? '' : 's'})`}
                                        />
                                      ))}
                                    </div>
                                    <div className="text-[10px] text-[#737373] mt-1.5 flex items-center gap-2 flex-wrap">
                                      {projectsByHours.length === 0 ? (
                                        <span>No tickets this week</span>
                                      ) : (
                                        <>
                                          {projectsByHours.slice(0, 3).map((p, i) => (
                                            <React.Fragment key={p.projectId}>
                                              {i > 0 && (
                                                <span className="text-[rgba(255,255,255,0.15)]">
                                                  ·
                                                </span>
                                              )}
                                              <span className="flex items-center gap-1">
                                                <span
                                                  className="w-1.5 h-1.5 rounded-sm"
                                                  style={{
                                                    backgroundColor: projectColor(p.projectId),
                                                  }}
                                                />
                                                <span
                                                  className="truncate max-w-[120px]"
                                                  title={p.projectName}
                                                >
                                                  {p.projectName}
                                                </span>
                                                <span>· {p.total}h</span>
                                              </span>
                                            </React.Fragment>
                                          ))}
                                          {projectsByHours.length > 3 && (
                                            <>
                                              <span className="text-[rgba(255,255,255,0.15)]">
                                                ·
                                              </span>
                                              <span>+{projectsByHours.length - 3} more</span>
                                            </>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  <span
                                    className={`text-xs font-medium whitespace-nowrap ${
                                      capacityStatus === 'Available'
                                        ? 'text-[#E0B954]'
                                        : capacityStatus === 'Busy'
                                          ? 'text-[#F59E0B]'
                                          : 'text-[#a3a3a3]'
                                    }`}
                                  >
                                    {capacityStatus} · {capacityUsed}h/40h ({capacityPercentage}%)
                                  </span>
                                </div>
                              </td>
                              <td className="px-5 py-4">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEditEmployee(emp)}
                                    className="text-[#737373] hover:text-white h-8 w-8 p-0"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteEmployee(emp.id)}
                                    className="text-red-400 hover:text-red-300 h-8 w-8 p-0"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="border-b border-[rgba(255,255,255,0.03)] bg-[rgba(0,0,0,0.25)]">
                                <td colSpan={7} className="px-5 py-5">
                                  <div className="space-y-4">
                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                      <div className="text-xs text-[#737373]">
                                        Week:{' '}
                                        <span className="text-[#a3a3a3] font-mono">
                                          {devCapacity?.week_start
                                            ? new Date(devCapacity.week_start).toLocaleDateString(
                                                undefined,
                                                { month: 'short', day: 'numeric' },
                                              )
                                            : '—'}
                                          {' → '}
                                          {devCapacity?.week_end
                                            ? new Date(devCapacity.week_end).toLocaleDateString(
                                                undefined,
                                                { month: 'short', day: 'numeric' },
                                              )
                                            : '—'}
                                        </span>
                                        <span className="ml-2 text-[#737373]">
                                          (Sat → Fri, UTC)
                                        </span>
                                      </div>
                                      {tickets.length === 0 && (
                                        <span className="text-xs text-[#737373]">
                                          No tickets contributing this week.
                                        </span>
                                      )}
                                    </div>

                                    {projectsByHours.length > 0 && (
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {projectsByHours.map((p) => {
                                          const color = projectColor(p.projectId);
                                          const sortedTickets = [...p.tickets].sort(
                                            (a, b) => b.counted_hours - a.counted_hours,
                                          );
                                          return (
                                            <div
                                              key={p.projectId}
                                              className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-3"
                                            >
                                              <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                  <span
                                                    className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                                                    style={{ backgroundColor: color }}
                                                  />
                                                  <span
                                                    className="text-xs font-semibold text-white truncate"
                                                    title={p.projectName}
                                                  >
                                                    {p.projectName}
                                                  </span>
                                                  <span className="text-[10px] text-[#737373] flex-shrink-0">
                                                    ({p.tickets.length})
                                                  </span>
                                                </div>
                                                <span
                                                  className="text-xs font-mono tabular-nums flex-shrink-0"
                                                  style={{ color }}
                                                >
                                                  {p.total}h
                                                </span>
                                              </div>
                                              <ul className="space-y-1.5">
                                                {sortedTickets.map((t) => {
                                                  const sColor = statusBadgeColor(t.status);
                                                  return (
                                                    <li
                                                      key={t.id}
                                                      className="flex items-start gap-2 text-xs"
                                                    >
                                                      <span className="font-mono text-[#E0B954] mt-0.5 flex-shrink-0">
                                                        {t.key}
                                                      </span>
                                                      <div className="flex-1 min-w-0">
                                                        <div className="text-white truncate">
                                                          {t.title}
                                                        </div>
                                                        <div className="text-[10px] text-[#737373] mt-0.5 flex items-center gap-1.5 flex-wrap">
                                                          <span
                                                            className="px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider"
                                                            style={{
                                                              backgroundColor: `${sColor}22`,
                                                              color: sColor,
                                                              fontSize: '9px',
                                                            }}
                                                          >
                                                            {t.status.replace('_', ' ')}
                                                          </span>
                                                          <span>est {t.estimated_hours}h</span>
                                                          <span className="text-[rgba(255,255,255,0.15)]">
                                                            ·
                                                          </span>
                                                          <span>logged {t.logged_hours}h</span>
                                                          <span className="text-[rgba(255,255,255,0.15)]">
                                                            ·
                                                          </span>
                                                          <span>
                                                            remaining {t.remaining_hours}h
                                                          </span>
                                                          {t.counted_basis ===
                                                            'remaining (transferred)' && (
                                                            <span className="px-1 py-0.5 rounded bg-[#FBBF24]/15 text-[#FBBF24] text-[9px] font-semibold uppercase tracking-wider">
                                                              transferred
                                                            </span>
                                                          )}
                                                        </div>
                                                      </div>
                                                      <span
                                                        className="font-mono tabular-nums flex-shrink-0"
                                                        style={{ color }}
                                                        title={`Counted as ${t.counted_basis}`}
                                                      >
                                                        +{t.counted_hours}h
                                                      </span>
                                                    </li>
                                                  );
                                                })}
                                              </ul>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                  {employees.length === 0 && (
                    <div className="text-center py-12 text-[#737373]">
                      No employees yet. Click "Add Employee" to get started.
                    </div>
                  )}
                  {employees.length > 0 && filteredEmployeeRows.length === 0 && (
                    <div className="text-center py-12 text-sm text-[#737373]">
                      No employees match the current filters.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Projects Tab */}
            {activeTab === 'projects' && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white">All Projects</h2>
                <div className="grid grid-cols-3 gap-4">
                  {projects.map((project) => (
                    <div
                      key={project.id}
                      className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl p-5 hover:border-[rgba(224,185,84,0.3)] transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div
                          className="cursor-pointer flex-1"
                          onClick={() => navigate(`/project/${project.id}`)}
                        >
                          <h3 className="text-sm font-semibold text-white">{project.name}</h3>
                          <div className="text-xs text-[#737373] mt-0.5">{project.status}</div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleEditGitHubSettings(project, e)}
                          className="text-[#737373] hover:text-white h-7 w-7 p-0"
                        >
                          <Settings className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      {/* GitHub Info + Invite */}
                      {project.github_repo_url && (
                        <div className="mb-3 p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.03)]">
                          <div className="flex items-center gap-2 mb-2">
                            <Github className="w-3.5 h-3.5 text-[#737373]" />
                            <a
                              href={project.github_repo_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-[#E0B954] hover:underline flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {project.github_repo_name || project.github_repo_url}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                            {project.has_github_token && (
                              <span className="ml-auto text-[10px] text-[#E0B954] flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Token
                              </span>
                            )}
                          </div>
                          <Button
                            size="sm"
                            onClick={(e) => handleSendGitHubInvites(project, e)}
                            disabled={invitingProjectId === project.id}
                            className="w-full h-7 text-[10px] bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white rounded-lg font-medium shadow-sm disabled:opacity-50"
                          >
                            {invitingProjectId === project.id ? (
                              <>
                                <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin mr-1" />
                                Sending...
                              </>
                            ) : (
                              <>
                                <Mail className="w-3 h-3 mr-1" />
                                Send GitHub Invites
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                      {!project.github_repo_url && (
                        <div className="mb-3 p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.03)] flex items-center gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-[#737373]" />
                          <span className="text-[10px] text-[#737373]">
                            No GitHub repo configured
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-4 mt-4 text-xs text-[#737373]">
                        <button
                          onClick={(e) => handleOpenProjectMembers(project, e)}
                          className="flex items-center gap-1 hover:text-[#E0B954] transition-colors cursor-pointer rounded px-1 -mx-1 hover:bg-[rgba(224,185,84,0.08)]"
                          title="View and manage project members"
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span className="underline-offset-2 hover:underline">
                            {project.developer_count}
                          </span>
                        </button>
                        <div className="flex items-center gap-1">
                          <Ticket className="w-3.5 h-3.5" />
                          {project.total_items}
                        </div>
                      </div>
                      <div className="mt-4">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-[#737373]">Progress</span>
                          <span className="text-[#a3a3a3]">{project.completion_pct}%</span>
                        </div>
                        <div className="h-1.5 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#E0B954] to-[#B8872A] rounded-full"
                            style={{ width: `${project.completion_pct}%` }}
                          />
                        </div>
                      </div>
                      {/* Pulse Settings — opens this project's Pulse Settings tab in ProjectDetail */}
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/project/${project.id}?tab=pulse_settings`);
                        }}
                        className="w-full mt-3 h-8 text-[11px] bg-[rgba(224,185,84,0.1)] hover:bg-[rgba(224,185,84,0.18)] border border-[rgba(224,185,84,0.3)] text-[#E0B954] rounded-lg font-semibold"
                      >
                        <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
                        Edit Pulse values
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Users Tab */}
            {activeTab === 'users' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">User Management</h2>
                </div>

                {/* Filter bar */}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={usersRoleFilter}
                    onChange={(e) => setUsersRoleFilter(e.target.value)}
                    className="h-9 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
                    title="Filter by role"
                  >
                    <option value="all">All roles</option>
                    {availableUserRoles.map((r) => (
                      <option key={r} value={r}>
                        {toPascalCase(r)}
                      </option>
                    ))}
                  </select>
                  {usersRoleFilter !== 'all' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setUsersRoleFilter('all')}
                      className="h-9 text-xs text-[#737373] hover:text-white rounded-xl px-3"
                    >
                      Clear filter
                    </Button>
                  )}
                  <div className="ml-auto text-xs text-[#737373]">
                    {visibleUsers.length} of {users.length}
                  </div>
                </div>

                <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl overflow-visible">
                  <table className="w-full">
                    <thead className="bg-[rgba(255,255,255,0.02)]">
                      <tr>
                        {(
                          [
                            { key: 'name' as const, label: 'User', sortable: true },
                            { key: null, label: 'Roles', sortable: false },
                            { key: 'status' as const, label: 'Status', sortable: true },
                            { key: 'last_login' as const, label: 'Last Login', sortable: true },
                            { key: null, label: 'Restrictions', sortable: false },
                          ] as const
                        ).map((col, i) => {
                          const isActive = col.sortable && col.key && usersSort.key === col.key;
                          const ArrowIcon = isActive
                            ? usersSort.dir === 'asc'
                              ? ChevronUp
                              : ChevronDown
                            : ArrowUpDown;
                          const baseCls = 'text-left text-xs font-medium text-[#737373] py-3 px-4';
                          if (!col.sortable || !col.key) {
                            return (
                              <th key={i} className={baseCls}>
                                {col.label}
                              </th>
                            );
                          }
                          return (
                            <th key={i} className={baseCls}>
                              <button
                                onClick={() => handleUsersSort(col.key as UsersSortKey)}
                                className={`inline-flex items-center gap-1 hover:text-white transition-colors ${isActive ? 'text-white' : ''}`}
                                title={`Sort by ${col.label}`}
                              >
                                {col.label}
                                <ArrowIcon
                                  className={`w-3 h-3 ${isActive ? 'opacity-100' : 'opacity-40'}`}
                                />
                              </button>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[rgba(255,255,255,0.03)]">
                      {visibleUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-[rgba(255,255,255,0.02)]">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center text-white text-sm font-medium">
                                {user.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="text-sm text-white">{user.name}</div>
                                <div className="text-xs text-[#737373]">{user.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-1 mb-2 items-center">
                              {user.role
                                .split(',')
                                .slice(0, 2)
                                .map((r, i) => {
                                  const role = r.trim();
                                  return (
                                    <span
                                      key={i}
                                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                                        role === 'admin'
                                          ? 'bg-[#E0B954]/20 text-[#E0B954]'
                                          : 'bg-[#E0B954]/20 text-[#E0B954]'
                                      }`}
                                    >
                                      {role === 'admin' && <Shield className="w-3 h-3" />}
                                      {role === 'project_manager' && (
                                        <UserCog className="w-3 h-3" />
                                      )}
                                      {toPascalCase(role)}
                                    </span>
                                  );
                                })}
                              {user.role.split(',').length > 2 && (
                                <button
                                  onClick={() => setOpenRoleDropdown(user.id)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-[#E0B954]/20 text-[#E0B954] hover:bg-[#E0B954]/30 transition cursor-pointer"
                                >
                                  +{user.role.split(',').length - 2}
                                </button>
                              )}
                            </div>
                            <button
                              onClick={() => setOpenRoleDropdown(user.id)}
                              className="text-xs px-2 py-1 rounded bg-[rgba(224,185,84,0.1)] text-[#E0B954] hover:bg-[rgba(224,185,84,0.2)] transition"
                            >
                              Edit Roles
                            </button>
                          </td>
                          <td className="py-3 px-4">
                            {user.is_active ? (
                              <span className="inline-flex items-center gap-1 text-xs text-[#E0B954]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#E0B954]" />
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-[#737373]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#737373]" />
                                Inactive
                              </span>
                            )}
                            {user.is_first_login && (
                              <span className="ml-2 text-[10px] text-[#F59E0B]">(First Login)</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm text-[#737373]">
                            {user.last_login_at
                              ? new Date(user.last_login_at).toLocaleDateString()
                              : 'Never'}
                          </td>
                          <td className="py-3 px-4">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenUserRestrictionsModal(user)}
                              className="text-[#737373] hover:text-[#E0B954] hover:bg-[#E0B954]/10 h-8"
                            >
                              <Shield className="w-3.5 h-3.5 mr-1" />
                              Restrictions
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {users.length === 0 && (
                    <div className="text-center py-12 text-[#737373]">
                      No users yet. Click "Add User" to create one.
                    </div>
                  )}
                  {users.length > 0 && visibleUsers.length === 0 && (
                    <div className="text-center py-12 text-sm text-[#737373]">
                      No users match the current filter.
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* Custom Restrictions Tab */}
            {activeTab === 'custom-restrictions' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">
                    Custom Restrictions Management
                  </h2>
                  <Button
                    onClick={handleCreateRestriction}
                    className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white rounded-xl h-10 px-4"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Restriction
                  </Button>
                </div>
                <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl overflow-visible">
                  <table className="w-full">
                    <thead className="bg-[rgba(255,255,255,0.02)]">
                      <tr>
                        <th className="text-left text-xs font-medium text-[#737373] py-3 px-4">
                          Name
                        </th>
                        <th className="text-left text-xs font-medium text-[#737373] py-3 px-4">
                          Tab
                        </th>
                        <th className="text-left text-xs font-medium text-[#737373] py-3 px-4">
                          Subsection
                        </th>
                        <th className="text-left text-xs font-medium text-[#737373] py-3 px-4">
                          Created
                        </th>
                        <th className="text-right text-xs font-medium text-[#737373] py-3 px-4">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[rgba(255,255,255,0.03)]">
                      {customRestrictions.map((restriction) => (
                        <tr key={restriction.id} className="hover:bg-[rgba(255,255,255,0.02)]">
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center gap-2 px-2 py-1 rounded text-xs bg-[#E0B954]/20 text-[#E0B954]">
                              <Shield className="w-3 h-3" />
                              {restriction.name}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-[#a3a3a3]">
                            {toPascalCase(restriction.tab_name)}
                          </td>
                          <td className="py-3 px-4 text-sm text-[#a3a3a3]">
                            {restriction.subsection}
                          </td>
                          <td className="py-3 px-4 text-sm text-[#737373]">
                            {new Date(restriction.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditRestriction(restriction)}
                                className="text-[#737373] hover:text-red-400 h-8"
                              >
                                <Pencil className="w-3.5 h-3.5 mr-1" />
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteRestriction(restriction.id)}
                                className="text-[#737373] hover:text-red-400 h-8"
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-1" />
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {customRestrictions.length === 0 && (
                    <div className="text-center py-12 text-[#737373]">
                      No custom restrictions yet. Click "Add Restriction" to create one.
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Role Management Modal */}
      {openRoleDropdown && users.find((u) => u.id === openRoleDropdown) && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setOpenRoleDropdown(null)}
        >
          <div
            className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
              <h2 className="text-lg font-bold text-white">
                Edit Roles - {users.find((u) => u.id === openRoleDropdown)?.name}
              </h2>
              <button
                onClick={() => setOpenRoleDropdown(null)}
                className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {['admin', 'project_manager', 'developer'].map((role) => {
                const user = users.find((u) => u.id === openRoleDropdown);
                const isChecked = user?.role.includes(role) || false;
                return (
                  <label
                    key={role}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-[rgba(255,255,255,0.02)] cursor-pointer transition"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => user && handleToggleUserRole(user, role)}
                      className="w-5 h-5 rounded cursor-pointer"
                    />
                    <div className="flex-1">
                      <span className="text-sm text-white font-medium">{toPascalCase(role)}</span>
                      <p className="text-xs text-[#737373] mt-0.5">
                        {role === 'admin' && 'Full system access and user management'}
                        {role === 'project_manager' && 'Manage projects and team workload'}
                        {role === 'developer' && 'Access to assigned projects and tasks'}
                      </p>
                    </div>
                  </label>
                );
              })}
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
      )}

      {/* Custom Restriction Modal */}
      {showRestrictionModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowRestrictionModal(false)}
        >
          <div
            className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
              <h2 className="text-lg font-bold text-white">
                {editingRestriction ? 'Edit Restriction' : 'Add Custom Restriction'}
              </h2>
              <button
                onClick={() => setShowRestrictionModal(false)}
                className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">
                  Restriction Name *
                </label>
                <Input
                  value={restrictionForm.name}
                  onChange={(e) => setRestrictionForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g., NoWorkload, NoAnalytics"
                  className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">
                  Tab Name *
                </label>
                <select
                  value={restrictionForm.tab_name}
                  onChange={(e) => setRestrictionForm((f) => ({ ...f, tab_name: e.target.value }))}
                  className="w-full bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 px-3 text-sm"
                >
                  <option value="">Select a tab...</option>
                  <option value="project_manager">Project Manager</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">
                  Subsection *
                </label>
                <Input
                  value={restrictionForm.subsection}
                  onChange={(e) =>
                    setRestrictionForm((f) => ({ ...f, subsection: e.target.value }))
                  }
                  placeholder="e.g., workload, analytics, timeline"
                  className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                />
                <p className="text-[10px] text-[#737373] mt-1">
                  The subsection within the tab that will be hidden from users with this
                  restriction.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-[rgba(255,255,255,0.05)]">
              <button
                onClick={() => setShowRestrictionModal(false)}
                className="px-4 py-2 rounded-lg text-[#737373] hover:bg-[rgba(255,255,255,0.05)] transition"
              >
                Cancel
              </button>
              <Button
                onClick={handleSaveRestriction}
                className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20"
              >
                <Save className="w-4 h-4 mr-2" />
                {editingRestriction ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Employee Modal */}
      {showEmployeeModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowEmployeeModal(false)}
        >
          <div
            className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
              <h2 className="text-lg font-bold text-white">
                {editingEmployee ? 'Edit Employee' : 'Add Employee'}
              </h2>
              <button
                onClick={() => setShowEmployeeModal(false)}
                className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">Name *</label>
                <Input
                  value={employeeForm.name}
                  onChange={(e) => setEmployeeForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="John Doe"
                  className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">Email *</label>
                <Input
                  type="email"
                  value={employeeForm.email}
                  onChange={(e) => setEmployeeForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="john@company.com"
                  className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">
                  GitHub Username
                </label>
                <Input
                  value={employeeForm.github_username}
                  onChange={(e) =>
                    setEmployeeForm((f) => ({ ...f, github_username: e.target.value }))
                  }
                  placeholder="johndoe"
                  className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">
                  Specialization
                </label>
                <select
                  value={employeeForm.specialization}
                  onChange={(e) =>
                    setEmployeeForm((f) => ({ ...f, specialization: e.target.value }))
                  }
                  className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
                >
                  <option value="">Select specialization</option>
                  <option value="frontend">Frontend</option>
                  <option value="backend">Backend</option>
                  <option value="fullstack">Full Stack</option>
                  <option value="devops">DevOps</option>
                  <option value="qa">QA</option>
                  <option value="mobile">Mobile</option>
                  <option value="data">Data</option>
                  <option value="ml">Machine Learning</option>
                  <option value="design">Design</option>
                  <option value="pm">Product Manager</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-[rgba(255,255,255,0.05)]">
              <Button
                variant="ghost"
                onClick={() => setShowEmployeeModal(false)}
                className="text-[#737373] rounded-xl px-5"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveEmployee}
                className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20"
              >
                <Save className="w-4 h-4 mr-2" />
                {editingEmployee ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* User Modal */}
      {showUserModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowUserModal(false)}
        >
          <div
            className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
              <h2 className="text-lg font-bold text-white">Add New User</h2>
              <button
                onClick={() => setShowUserModal(false)}
                className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {generatedPassword ? (
                <div className="space-y-4">
                  <div className="p-4 bg-[rgba(224,185,84,0.1)] border border-[rgba(224,185,84,0.2)] rounded-xl">
                    <p className="text-sm text-[#E0B954] font-medium mb-2">
                      User Created Successfully!
                    </p>
                    <p className="text-xs text-[#a3a3a3] mb-2">
                      Share this temporary password with the user:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-[rgba(244,246,255,0.05)] px-3 py-2 rounded-lg text-sm text-white font-mono">
                        {generatedPassword}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(generatedPassword);
                          toast.success('Copied to clipboard');
                        }}
                        className="text-[#737373] hover:text-white"
                      >
                        Copy
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-[#737373]">
                    They will be required to change this password on first login.
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-xs font-medium text-[#737373] block mb-1.5">
                      Name *
                    </label>
                    <Input
                      value={userForm.name}
                      onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="John Doe"
                      className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#737373] block mb-1.5">
                      Email *
                    </label>
                    <Input
                      type="email"
                      value={userForm.email}
                      onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="john@company.com"
                      className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#737373] block mb-2">Roles</label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={userForm.roles.includes('admin')}
                          onChange={() => handleRoleToggle('admin')}
                          className="w-4 h-4 rounded border-[rgba(244,246,255,0.2)] bg-[rgba(255,255,255,0.025)] text-[#E0B954] focus:ring-[#E0B954]"
                        />
                        <span className="text-sm text-[#f5f5f5]">Admin</span>
                        <span className="text-xs text-[#737373]">(Full access)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={userForm.roles.includes('project_manager')}
                          onChange={() => handleRoleToggle('project_manager')}
                          className="w-4 h-4 rounded border-[rgba(244,246,255,0.2)] bg-[rgba(255,255,255,0.025)] text-[#C79E3B] focus:ring-[#C79E3B]"
                        />
                        <span className="text-sm text-[#f5f5f5]">Project Manager</span>
                        <span className="text-xs text-[#737373]">(PM tab access)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={userForm.roles.includes('developer')}
                          onChange={() => handleRoleToggle('developer')}
                          className="w-4 h-4 rounded border-[rgba(244,246,255,0.2)] bg-[rgba(255,255,255,0.025)] text-[#E0B954] focus:ring-[#E0B954]"
                        />
                        <span className="text-sm text-[#f5f5f5]">Developer</span>
                        <span className="text-xs text-[#737373]">(Project access)</span>
                      </label>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-[rgba(255,255,255,0.05)]">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowUserModal(false);
                  setGeneratedPassword(null);
                }}
                className="text-[#737373] rounded-xl px-5"
              >
                {generatedPassword ? 'Close' : 'Cancel'}
              </Button>
              {!generatedPassword && (
                <Button
                  onClick={handleSaveUser}
                  className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create User
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* User Restrictions Modal */}
      {showUserRestrictionsModal && selectedUserForRestrictions && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowUserRestrictionsModal(false)}
        >
          <div
            className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
              <div>
                <h2 className="text-lg font-bold text-white">Manage Restrictions</h2>
                <p className="text-xs text-[#737373] mt-0.5">{selectedUserForRestrictions.name}</p>
              </div>
              <button
                onClick={() => setShowUserRestrictionsModal(false)}
                className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-2 max-h-96 overflow-y-auto">
              {userRestrictionsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin w-6 h-6 border-2 border-[#E0B954] border-t-transparent rounded-full" />
                </div>
              ) : customRestrictions.length === 0 ? (
                <p className="text-sm text-[#737373] text-center py-8">
                  No custom restrictions available
                </p>
              ) : (
                customRestrictions.map((restriction) => (
                  <label
                    key={restriction.id}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-[rgba(255,255,255,0.02)] cursor-pointer transition"
                  >
                    <input
                      type="checkbox"
                      checked={userRestrictionsList.includes(restriction.id)}
                      onChange={(e) =>
                        handleToggleUserRestriction(restriction.id, e.target.checked)
                      }
                      className="w-5 h-5 rounded cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-white font-medium block">
                        {restriction.name}
                      </span>
                      <p className="text-xs text-[#737373] mt-0.5">
                        {toPascalCase(restriction.tab_name)} →{' '}
                        {toPascalCase(restriction.subsection)}
                      </p>
                    </div>
                  </label>
                ))
              )}
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-[rgba(255,255,255,0.05)]">
              <button
                onClick={() => setShowUserRestrictionsModal(false)}
                className="px-4 py-2 rounded-lg text-[#737373] hover:bg-[rgba(255,255,255,0.05)] transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GitHub Settings Modal */}
      {showGitHubModal && editingProject && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowGitHubModal(false)}
        >
          <div
            className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
              <div>
                <h2 className="text-lg font-bold text-white">GitHub Settings</h2>
                <p className="text-xs text-[#737373] mt-0.5">{editingProject.name}</p>
              </div>
              <button
                onClick={() => setShowGitHubModal(false)}
                className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">
                  Repository URL
                </label>
                <Input
                  value={gitHubForm.github_repo_url}
                  onChange={(e) =>
                    setGitHubForm((f) => ({ ...f, github_repo_url: e.target.value }))
                  }
                  placeholder="https://github.com/org/repo"
                  className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">
                  Repository Name (org/repo)
                </label>
                <Input
                  value={gitHubForm.github_repo_name}
                  onChange={(e) =>
                    setGitHubForm((f) => ({ ...f, github_repo_name: e.target.value }))
                  }
                  placeholder="myorg/myrepo"
                  className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[#737373] block mb-1.5">
                  GitHub Token
                </label>
                <Input
                  type="password"
                  value={gitHubForm.github_token}
                  onChange={(e) => setGitHubForm((f) => ({ ...f, github_token: e.target.value }))}
                  placeholder={
                    editingProject.has_github_token
                      ? 'Token already set (leave empty to keep)'
                      : 'ghp_xxxx...'
                  }
                  className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                />
                <p className="text-[10px] text-[#737373] mt-1">
                  Token needs repo scope for invitations. Leave empty to keep existing token.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-[rgba(255,255,255,0.05)]">
              <Button
                variant="ghost"
                onClick={() => setShowGitHubModal(false)}
                className="text-[#737373] rounded-xl px-5"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveGitHubSettings}
                className="bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl px-6 font-medium shadow-lg shadow-[#B8872A]/20"
              >
                <Github className="w-4 h-4 mr-2" />
                Save Settings
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Project Members Modal */}
      {showProjectMembersModal && selectedProjectForMembers && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowProjectMembersModal(false)}
        >
          <div
            className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
              <div>
                <h2 className="text-lg font-bold text-white">Project Members</h2>
                <div className="text-xs text-[#737373] mt-0.5">
                  {selectedProjectForMembers.name}
                </div>
              </div>
              <button
                onClick={() => setShowProjectMembersModal(false)}
                className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto">
              {/* Current members */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-[#a3a3a3] uppercase tracking-wider">
                    Current Members
                  </h3>
                  <span className="text-xs text-[#737373]">{projectMembers.length} total</span>
                </div>
                {projectMembersLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin w-6 h-6 border-2 border-[#E0B954] border-t-transparent rounded-full" />
                  </div>
                ) : projectMembers.length === 0 ? (
                  <div className="text-center py-8 text-sm text-[#737373] bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl">
                    No members assigned yet.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {projectMembers.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-[rgba(224,185,84,0.2)] flex items-center justify-center text-sm font-medium text-[#E0B954] flex-shrink-0">
                            {m.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-white truncate flex items-center gap-2">
                              {m.name}
                              {m.is_admin && (
                                <span className="px-1.5 py-0.5 rounded bg-[rgba(224,185,84,0.15)] text-[#E0B954] text-[9px] font-semibold uppercase tracking-wider">
                                  Admin
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-[#737373] truncate">
                              {m.email}
                              {m.role && <span className="ml-2 capitalize">· {m.role}</span>}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveProjectMember(m.id)}
                          disabled={removeMemberMutation.isPending}
                          className="text-red-400 hover:text-red-300 h-8 w-8 p-0 flex-shrink-0"
                          title="Remove from project"
                        >
                          {removeMemberMutation.isPending ? (
                            <div className="w-3.5 h-3.5 border border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Add member */}
              <div>
                <h3 className="text-xs font-semibold text-[#a3a3a3] uppercase tracking-wider mb-2">
                  Add Member
                </h3>
                {(() => {
                  const assignedIds = new Set(projectMembers.map((m) => m.id));
                  const available = employees.filter((e) => !assignedIds.has(e.id));
                  return (
                    <div className="p-3 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] space-y-3">
                      {available.length === 0 ? (
                        <div className="text-xs text-[#737373] py-2 text-center">
                          All employees are already on this project.
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] font-medium text-[#737373] uppercase tracking-wider block mb-1.5">
                                Employee
                              </label>
                              <select
                                value={addMemberForm.developer_id}
                                onChange={(e) =>
                                  setAddMemberForm((f) => ({ ...f, developer_id: e.target.value }))
                                }
                                className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
                              >
                                <option value="">Select an employee</option>
                                {available.map((emp) => (
                                  <option key={emp.id} value={emp.id}>
                                    {emp.name} · {emp.email}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-medium text-[#737373] uppercase tracking-wider block mb-1.5">
                                Role
                              </label>
                              <select
                                value={addMemberForm.role}
                                onChange={(e) =>
                                  setAddMemberForm((f) => ({ ...f, role: e.target.value }))
                                }
                                className="w-full h-10 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
                              >
                                <option value="developer">Developer</option>
                                <option value="lead">Lead</option>
                                <option value="qa">QA</option>
                                <option value="designer">Designer</option>
                                <option value="pm">Product Manager</option>
                              </select>
                            </div>
                          </div>
                          <Button
                            onClick={handleAddProjectMember}
                            disabled={addMemberMutation.isPending || !addMemberForm.developer_id}
                            className="w-full h-9 bg-gradient-to-r from-[#E0B954] to-[#B8872A] text-white rounded-xl font-medium disabled:opacity-50"
                          >
                            {addMemberMutation.isPending ? (
                              <>
                                <div className="w-3.5 h-3.5 border border-white/30 border-t-white rounded-full animate-spin mr-2" />
                                Adding...
                              </>
                            ) : (
                              <>
                                <Plus className="w-4 h-4 mr-1.5" />
                                Add to Project
                              </>
                            )}
                          </Button>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="flex justify-end gap-3 p-5 border-t border-[rgba(255,255,255,0.05)]">
              <Button
                variant="ghost"
                onClick={() => setShowProjectMembersModal(false)}
                className="text-[#737373] rounded-xl px-5"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
