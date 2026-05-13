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
  ArrowUpDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast, Toaster } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import RoleManagementModal from './modals/RoleManagementModal';
import RestrictionModal from './modals/RestrictionModal';
import EmployeeModal from './modals/EmployeeModal';
import UserModal from './modals/UserModal';
import UserRestrictionsModal from './modals/UserRestrictionsModal';
import GitHubSettingsModal from './modals/GitHubSettingsModal';
import ProjectMembersModal from './modals/ProjectMembersModal';
import EmployeesTab from './tabs/EmployeesTab';

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
              <EmployeesTab
                employees={employees}
                developerCapacities={developerCapacities}
                handleCreateEmployee={handleCreateEmployee}
                handleEditEmployee={handleEditEmployee}
                handleDeleteEmployee={handleDeleteEmployee}
              />
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
      <RoleManagementModal
        openRoleDropdown={openRoleDropdown}
        users={users}
        setOpenRoleDropdown={setOpenRoleDropdown}
        handleToggleUserRole={handleToggleUserRole}
        toPascalCase={toPascalCase}
      />

      {/* Custom Restriction Modal */}
      <RestrictionModal
        showRestrictionModal={showRestrictionModal}
        editingRestriction={editingRestriction}
        restrictionForm={restrictionForm}
        setRestrictionForm={setRestrictionForm}
        setShowRestrictionModal={setShowRestrictionModal}
        handleSaveRestriction={handleSaveRestriction}
      />

      {/* Employee Modal */}
      <EmployeeModal
        showEmployeeModal={showEmployeeModal}
        editingEmployee={editingEmployee}
        employeeForm={employeeForm}
        setEmployeeForm={setEmployeeForm}
        setShowEmployeeModal={setShowEmployeeModal}
        handleSaveEmployee={handleSaveEmployee}
      />

      {/* User Modal */}
      <UserModal
        showUserModal={showUserModal}
        userForm={userForm}
        setUserForm={setUserForm}
        generatedPassword={generatedPassword}
        setGeneratedPassword={setGeneratedPassword}
        setShowUserModal={setShowUserModal}
        handleSaveUser={handleSaveUser}
        handleRoleToggle={handleRoleToggle}
      />

      {/* User Restrictions Modal */}
      <UserRestrictionsModal
        showUserRestrictionsModal={showUserRestrictionsModal}
        selectedUserForRestrictions={selectedUserForRestrictions}
        customRestrictions={customRestrictions}
        userRestrictionsList={userRestrictionsList}
        userRestrictionsLoading={userRestrictionsLoading}
        setShowUserRestrictionsModal={setShowUserRestrictionsModal}
        handleToggleUserRestriction={handleToggleUserRestriction}
        toPascalCase={toPascalCase}
      />

      {/* GitHub Settings Modal */}
      <GitHubSettingsModal
        showGitHubModal={showGitHubModal}
        editingProject={editingProject}
        gitHubForm={gitHubForm}
        setGitHubForm={setGitHubForm}
        setShowGitHubModal={setShowGitHubModal}
        handleSaveGitHubSettings={handleSaveGitHubSettings}
      />

      {/* Project Members Modal */}
      <ProjectMembersModal
        showProjectMembersModal={showProjectMembersModal}
        selectedProjectForMembers={selectedProjectForMembers}
        projectMembers={projectMembers}
        projectMembersLoading={projectMembersLoading}
        employees={employees}
        addMemberForm={addMemberForm}
        setAddMemberForm={setAddMemberForm}
        addMemberMutation={addMemberMutation}
        removeMemberMutation={removeMemberMutation}
        setShowProjectMembersModal={setShowProjectMembersModal}
        handleAddProjectMember={handleAddProjectMember}
        handleRemoveProjectMember={handleRemoveProjectMember}
      />
    </div>
  );
};

export default AdminDashboard;
