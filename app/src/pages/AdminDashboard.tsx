import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
    Activity as ActivityIcon,
    Clock,
    Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast, Toaster } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

import { API_BASE_URL } from '@/config/api';

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
    role: string;  // Comma-separated roles
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

interface WorkItem {
    id: number;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    project_id: number;
    project_name: string;
    assigned_to: number | null;
    assigned_to_name: string | null;
    estimated_hours: number | null;
    logged_hours: number;
    created_at: string;
    updated_at: string;
}

const AdminDashboard = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'dashboard' | 'employees' | 'projects' | 'users' | 'developers-capacity' | 'custom-restrictions'>('dashboard');
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [developerCapacities, setDeveloperCapacities] = useState<DeveloperCapacity[]>([]);
    const [expandedCapacityDevId, setExpandedCapacityDevId] = useState<number | null>(null);
    const [projects, setProjects] = useState<Project[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const { token } = useAuth();
    
    // Custom restrictions state
    const [customRestrictions, setCustomRestrictions] = useState<any[]>([]);
    const [showRestrictionModal, setShowRestrictionModal] = useState(false);
    const [editingRestriction, setEditingRestriction] = useState<any | null>(null);
    const [restrictionForm, setRestrictionForm] = useState({
        name: '',
        tab_name: '',
        subsection: ''
    });
    
    // User restrictions management state
    const [showUserRestrictionsModal, setShowUserRestrictionsModal] = useState(false);
    const [selectedUserForRestrictions, setSelectedUserForRestrictions] = useState<User | null>(null);
    const [userRestrictionsList, setUserRestrictionsList] = useState<number[]>([]);
    const [userRestrictionsLoading, setUserRestrictionsLoading] = useState(false);
    
    // Role dropdown state
    const [openRoleDropdown, setOpenRoleDropdown] = useState<number | null>(null);
    
    // Helper function to convert role to Pascal Case
    const toPascalCase = (str: string): string => {
        return str
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
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

    // Employee tickets modal state
    const [showEmployeeTicketsModal, setShowEmployeeTicketsModal] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [employeeTickets, setEmployeeTickets] = useState<WorkItem[]>([]);
    const [ticketsLoading, setTicketsLoading] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [statsRes, employeesRes, projectsRes, usersRes, capacityRes, restrictionsRes] = await Promise.all([
                fetch(`${API_BASE_URL}/api/admin/stats`),
                fetch(`${API_BASE_URL}/api/admin/employees`),
                fetch(`${API_BASE_URL}/api/admin/projects`),
                fetch(`${API_BASE_URL}/api/auth/admin/users`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                fetch(`${API_BASE_URL}/api/admin/developers/capacity`),
                fetch(`${API_BASE_URL}/api/auth/admin/custom-restrictions`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
            ]);

            if (statsRes.ok) setStats(await statsRes.json());
            if (employeesRes.ok) setEmployees(await employeesRes.json());
            if (projectsRes.ok) setProjects(await projectsRes.json());
            if (usersRes.ok) setUsers(await usersRes.json());
            if (capacityRes.ok) setDeveloperCapacities(await capacityRes.json());
            if (restrictionsRes.ok) setCustomRestrictions(await restrictionsRes.json());
        } catch (error) {
            console.error('Failed to fetch admin data:', error);
            toast.error('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    };

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

    const handleSaveEmployee = async () => {
        if (!employeeForm.name.trim() || !employeeForm.email.trim()) {
            toast.error('Name and email are required');
            return;
        }

        try {
            const url = editingEmployee
                ? `${API_BASE_URL}/api/admin/employees/${editingEmployee.id}`
                : `${API_BASE_URL}/api/admin/employees`;
            const method = editingEmployee ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(employeeForm),
            });

            if (response.ok) {
                toast.success(editingEmployee ? 'Employee updated!' : 'Employee created!');
                setShowEmployeeModal(false);
                fetchData();
            } else {
                const error = await response.json();
                toast.error(error.detail || 'Failed to save employee');
            }
        } catch {
            toast.error('Failed to save employee');
        }
    };

    const handleDeleteEmployee = async (id: number) => {
        if (!confirm('Are you sure you want to delete this employee?')) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/employees/${id}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                toast.success('Employee deleted');
                fetchData();
            } else {
                toast.error('Failed to delete employee');
            }
        } catch {
            toast.error('Failed to delete employee');
        }
    };

    const handleViewEmployeeTickets = async (employee: Employee) => {
        setSelectedEmployee(employee);
        setTicketsLoading(true);
        setShowEmployeeTicketsModal(true);

        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/employees/${employee.id}/in-progress-tickets`);
            if (response.ok) {
                const tickets = await response.json();
                // Sort by priority: critical > high > medium > low
                const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
                const sorted = tickets.sort((a: WorkItem, b: WorkItem) => {
                    return (priorityOrder[a.priority.toLowerCase()] ?? 99) - (priorityOrder[b.priority.toLowerCase()] ?? 99);
                });
                setEmployeeTickets(sorted);
            } else {
                toast.error('Failed to fetch employee tickets');
            }
        } catch {
            toast.error('Failed to fetch employee tickets');
        } finally {
            setTicketsLoading(false);
        }
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

    const handleSaveGitHubSettings = async () => {
        if (!editingProject) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/projects/${editingProject.id}/github`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(gitHubForm),
            });

            if (response.ok) {
                toast.success('GitHub settings updated!');
                setShowGitHubModal(false);
                fetchData();
            } else {
                toast.error('Failed to update GitHub settings');
            }
        } catch {
            toast.error('Failed to update GitHub settings');
        }
    };

    const handleSendGitHubInvites = async (project: Project, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!project.github_repo_url) {
            toast.error('No GitHub repository configured');
            return;
        }
        setInvitingProjectId(project.id);
        try {
            const res = await fetch(`${API_BASE_URL}/api/projects/${project.id}/github-invite?role=push`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(`Sent ${data.successful_invitations} GitHub invitation(s) for ${project.name}!`);
            } else {
                toast.error(data.detail || 'Failed to send invitations');
            }
        } catch {
            toast.error('Failed to send invitations');
        } finally {
            setInvitingProjectId(null);
        }
    };

    // User management functions
    const [showUserModal, setShowUserModal] = useState(false);
    const [userForm, setUserForm] = useState<{ email: string; name: string; roles: string[] }>({ email: '', name: '', roles: ['developer'] });
    const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

    const handleRoleToggle = (role: string) => {
        setUserForm(f => {
            const roles = f.roles.includes(role)
                ? f.roles.filter(r => r !== role)
                : [...f.roles, role];
            return { ...f, roles: roles.length > 0 ? roles : ['developer'] };
        });
    };

    const handleSaveUser = async () => {
        if (!userForm.email.trim() || !userForm.name.trim()) {
            toast.error('Email and name are required');
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/admin/create-user`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    ...userForm,
                    role: userForm.roles.join(','),
                }),
            });

            if (response.ok) {
                const data = await response.json();
                toast.success('User created successfully!');
                setGeneratedPassword(data.temporary_password);
                fetchData();
            } else {
                const error = await response.json();
                toast.error(error.detail || 'Failed to create user');
            }
        } catch {
            toast.error('Failed to create user');
        }
    };

    const handleToggleUserRole = async (user: User, roleToToggle: string) => {
        const currentRoles = user.role.split(',').map(r => r.trim());
        let newRoles: string[];
        
        if (currentRoles.includes(roleToToggle)) {
            // Remove role, but ensure at least one role remains
            newRoles = currentRoles.filter(r => r !== roleToToggle);
            if (newRoles.length === 0) newRoles = ['developer'];
        } else {
            newRoles = [...currentRoles, roleToToggle];
        }
        
        const newRole = newRoles.join(',');
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/admin/users/${user.id}/role`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ role: newRole }),
            });

            if (response.ok) {
                toast.success('User roles updated');
                fetchData();
            } else {
                toast.error('Failed to update role');
            }
        } catch {
            toast.error('Failed to update role');
        }
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
            subsection: restriction.subsection
        });
        setShowRestrictionModal(true);
    };

    const handleSaveRestriction = async () => {
        if (!restrictionForm.name.trim() || !restrictionForm.tab_name || !restrictionForm.subsection) {
            toast.error('All fields are required');
            return;
        }

        try {
            const url = editingRestriction
                ? `${API_BASE_URL}/api/auth/admin/custom-restrictions/${editingRestriction.id}`
                : `${API_BASE_URL}/api/auth/admin/custom-restrictions`;
            const method = editingRestriction ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(restrictionForm),
            });

            if (response.ok) {
                toast.success(editingRestriction ? 'Restriction updated!' : 'Restriction created!');
                setShowRestrictionModal(false);
                fetchData();
            } else {
                const error = await response.json();
                toast.error(error.detail || 'Failed to save restriction');
            }
        } catch {
            toast.error('Failed to save restriction');
        }
    };

    const handleDeleteRestriction = async (restrictionId: number) => {
        if (!confirm('Are you sure you want to delete this custom restriction?')) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/admin/custom-restrictions/${restrictionId}`, {
                method: 'DELETE',
                headers: { 
                    'Authorization': `Bearer ${token}`
                },
            });

            if (response.ok) {
                toast.success('Restriction deleted!');
                fetchData();
            } else {
                const error = await response.json();
                toast.error(error.detail || 'Failed to delete restriction');
            }
        } catch {
            toast.error('Failed to delete restriction');
        }
    };

    // User Restrictions Management Handlers
    const handleOpenUserRestrictionsModal = async (user: User) => {
        setSelectedUserForRestrictions(user);
        setUserRestrictionsLoading(true);
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/admin/users/${user.id}/custom-restrictions`, {
                headers: { 
                    'Authorization': `Bearer ${token}`
                },
            });
            
            if (response.ok) {
                const userRestrictions = await response.json();
                setUserRestrictionsList(userRestrictions.map((r: any) => r.id));
            }
        } catch {
            toast.error('Failed to load user restrictions');
        } finally {
            setUserRestrictionsLoading(false);
            setShowUserRestrictionsModal(true);
        }
    };

    const handleToggleUserRestriction = async (restrictionId: number, isChecked: boolean) => {
        if (!selectedUserForRestrictions) return;

        try {
            const method = isChecked ? 'POST' : 'DELETE';
            const response = await fetch(
                `${API_BASE_URL}/api/auth/admin/users/${selectedUserForRestrictions.id}/custom-restrictions/${restrictionId}`,
                {
                    method,
                    headers: { 
                        'Authorization': `Bearer ${token}`
                    },
                }
            );

            if (response.ok) {
                if (isChecked) {
                    setUserRestrictionsList([...userRestrictionsList, restrictionId]);
                } else {
                    setUserRestrictionsList(userRestrictionsList.filter(id => id !== restrictionId));
                }
                toast.success(isChecked ? 'Restriction assigned!' : 'Restriction removed!');
            } else {
                const error = await response.json();
                toast.error(error.detail || 'Failed to update restriction');
            }
        } catch {
            toast.error('Failed to update restriction');
        }
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
                        ].map(tab => (
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
                        {activeTab === 'dashboard' && stats && (
                            <div className="space-y-6">
                                {/* Stats Cards */}
                                <div className="grid grid-cols-4 gap-4">
                                    {[
                                        { label: 'Total Employees', value: stats.total_employees, icon: Users, color: '#E0B954' },
                                        { label: 'Total Projects', value: stats.total_projects, icon: FolderKanban, color: '#E0B954' },
                                        { label: 'Total Tickets', value: stats.total_tickets, icon: Ticket, color: '#F59E0B' },
                                        { label: 'Active Sprints', value: stats.active_sprints, icon: Calendar, color: '#EC4899' },
                                    ].map((stat, i) => (
                                        <div key={i} className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl p-5">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="p-2 rounded-lg" style={{ backgroundColor: `${stat.color}20` }}>
                                                    <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
                                                </div>
                                            </div>
                                            <div className="text-2xl font-bold text-white">{stat.value}</div>
                                            <div className="text-sm text-[#737373]">{stat.label}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Charts */}
                                <div className="grid grid-cols-2 gap-6">
                                    {/* Tickets by Status */}
                                    <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl p-5">
                                        <h3 className="text-lg font-semibold text-white mb-4">Tickets by Status</h3>
                                        <div className="space-y-3">
                                            {Object.entries(stats.tickets_by_status).map(([status, count]) => (
                                                <div key={status} className="flex items-center gap-3">
                                                    <div className="w-24 text-sm text-[#a3a3a3] capitalize">{status.replace('_', ' ')}</div>
                                                    <div className="flex-1 h-2 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-[#E0B954] rounded-full"
                                                            style={{ width: `${stats.total_tickets ? (count / stats.total_tickets) * 100 : 0}%` }}
                                                        />
                                                    </div>
                                                    <div className="w-12 text-sm text-[#a3a3a3] text-right">{count}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Tickets by Priority */}
                                    <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl p-5">
                                        <h3 className="text-lg font-semibold text-white mb-4">Tickets by Priority</h3>
                                        <div className="space-y-3">
                                            {Object.entries(stats.tickets_by_priority).map(([priority, count]) => (
                                                <div key={priority} className="flex items-center gap-3">
                                                    <div className="w-24 text-sm text-[#a3a3a3] capitalize">{priority}</div>
                                                    <div className="flex-1 h-2 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full"
                                                            style={{
                                                                width: `${stats.total_tickets ? (count / stats.total_tickets) * 100 : 0}%`,
                                                                backgroundColor: priority === 'critical' ? '#EF4444' : priority === 'high' ? '#F97316' : priority === 'medium' ? '#F59E0B' : '#E0B954'
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="w-12 text-sm text-[#a3a3a3] text-right">{count}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

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

                                <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl overflow-hidden">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-[rgba(255,255,255,0.05)]">
                                                <th className="text-left text-xs font-medium text-[#737373] uppercase tracking-wider px-5 py-3">Name</th>
                                                <th className="text-left text-xs font-medium text-[#737373] uppercase tracking-wider px-5 py-3">Email</th>
                                                <th className="text-left text-xs font-medium text-[#737373] uppercase tracking-wider px-5 py-3">GitHub</th>
                                                <th className="text-left text-xs font-medium text-[#737373] uppercase tracking-wider px-5 py-3">Projects</th>
                                                <th className="text-left text-xs font-medium text-[#737373] uppercase tracking-wider px-5 py-3">Assigned</th>
                                                <th className="text-left text-xs font-medium text-[#737373] uppercase tracking-wider px-5 py-3">Capacity</th>
                                                <th className="text-right text-xs font-medium text-[#737373] uppercase tracking-wider px-5 py-3">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {employees.map(emp => {
                                                const devCapacity = developerCapacities.find(d => d.developer_id === emp.id);
                                                const capacityUsed = devCapacity?.this_week_capacity_used ?? 0;
                                                const capacityPercentage = Math.round((capacityUsed / 40) * 100);
                                                const remaining = devCapacity?.this_week_remaining_capacity ?? 40;
                                                const capacityStatus = remaining >= 10 ? 'Available'
                                                    : remaining > 0 ? 'Moderate'
                                                    : 'Busy';
                                                const inProgressH = devCapacity?.this_week_in_progress_hours ?? 0;
                                                const inReviewH = devCapacity?.this_week_in_review_hours ?? 0;
                                                const doneH = devCapacity?.this_week_done_hours ?? 0;
                                                const isExpanded = expandedCapacityDevId === emp.id;
                                                const tickets = devCapacity?.tickets ?? [];

                                                // Group tickets by status for the expanded view
                                                const groupedTickets = {
                                                    in_progress: tickets.filter(t => t.status === 'in_progress'),
                                                    in_review: tickets.filter(t => t.status === 'in_review'),
                                                    done: tickets.filter(t => t.status === 'done'),
                                                };

                                                return (
                                                <React.Fragment key={emp.id}>
                                                <tr className={`border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] ${isExpanded ? 'bg-[rgba(255,255,255,0.015)]' : ''}`}>
                                                    <td className="px-5 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-full bg-[rgba(224,185,84,0.2)] flex items-center justify-center text-sm font-medium text-[#E0B954]">
                                                                {emp.name.charAt(0).toUpperCase()}
                                                            </div>
                                                            <div>
                                                                <div className="text-sm font-medium text-white">{emp.name}</div>
                                                                {emp.specialization && (
                                                                    <div className="text-xs text-[#737373] capitalize">{emp.specialization}</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-4 text-sm text-[#a3a3a3]">{emp.email}</td>
                                                    <td className="px-5 py-4 text-sm text-[#737373]">{emp.github_username || '-'}</td>
                                                    <td className="px-5 py-4 text-sm text-[#a3a3a3]">{emp.project_count}</td>
                                                    <td className="px-5 py-4 text-sm text-[#a3a3a3]">{emp.assigned_items_count}</td>
                                                    <td
                                                        className="px-5 py-4 cursor-pointer hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                                                        onClick={() => setExpandedCapacityDevId(isExpanded ? null : emp.id)}
                                                        title="Click to see ticket-level breakdown"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            {isExpanded
                                                                ? <ChevronDown className="w-3.5 h-3.5 text-[#737373] flex-shrink-0" />
                                                                : <ChevronRight className="w-3.5 h-3.5 text-[#737373] flex-shrink-0" />}
                                                            <div className="flex-1 min-w-0 max-w-xs">
                                                                <div className="h-2 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden flex">
                                                                    {capacityUsed > 0 && (
                                                                        <>
                                                                            <div className="h-full bg-[#E0B954]" style={{ width: `${Math.min(100, (inProgressH / 40) * 100)}%` }} title={`In progress: ${inProgressH}h`} />
                                                                            <div className="h-full bg-[#A78BFA]" style={{ width: `${Math.min(100, (inReviewH / 40) * 100)}%` }} title={`In review: ${inReviewH}h`} />
                                                                            <div className="h-full bg-[#34D399]" style={{ width: `${Math.min(100, (doneH / 40) * 100)}%` }} title={`Done this week: ${doneH}h`} />
                                                                        </>
                                                                    )}
                                                                </div>
                                                                <div className="text-[10px] text-[#737373] mt-1.5 flex items-center gap-2 flex-wrap">
                                                                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-[#E0B954]" />{inProgressH}h in-progress</span>
                                                                    <span className="text-[rgba(255,255,255,0.15)]">·</span>
                                                                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-[#A78BFA]" />{inReviewH}h in-review</span>
                                                                    <span className="text-[rgba(255,255,255,0.15)]">·</span>
                                                                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-[#34D399]" />{doneH}h done</span>
                                                                </div>
                                                            </div>
                                                            <span className={`text-xs font-medium whitespace-nowrap ${
                                                                capacityStatus === 'Available' ? 'text-[#E0B954]' :
                                                                capacityStatus === 'Busy' ? 'text-[#F59E0B]' :
                                                                'text-[#a3a3a3]'
                                                            }`}>
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
                                                                        Week: <span className="text-[#a3a3a3] font-mono">
                                                                            {devCapacity?.week_start ? new Date(devCapacity.week_start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
                                                                            {' → '}
                                                                            {devCapacity?.week_end ? new Date(devCapacity.week_end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
                                                                        </span>
                                                                        <span className="ml-2 text-[#737373]">(Sat → Fri, UTC)</span>
                                                                    </div>
                                                                    {tickets.length === 0 && (
                                                                        <span className="text-xs text-[#737373]">No tickets contributing this week.</span>
                                                                    )}
                                                                </div>

                                                                {tickets.length > 0 && (
                                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                                        {([
                                                                            { key: 'in_progress', label: 'In progress', color: '#E0B954', icon: ActivityIcon, items: groupedTickets.in_progress, total: inProgressH },
                                                                            { key: 'in_review', label: 'In review', color: '#A78BFA', icon: Eye, items: groupedTickets.in_review, total: inReviewH },
                                                                            { key: 'done', label: 'Done this week', color: '#34D399', icon: CheckCircle2, items: groupedTickets.done, total: doneH },
                                                                        ] as const).map(group => {
                                                                            const Icon = group.icon;
                                                                            return (
                                                                                <div key={group.key} className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl p-3">
                                                                                    <div className="flex items-center justify-between mb-2">
                                                                                        <div className="flex items-center gap-2">
                                                                                            <Icon className="w-3.5 h-3.5" style={{ color: group.color }} />
                                                                                            <span className="text-xs font-semibold text-white">{group.label}</span>
                                                                                            <span className="text-[10px] text-[#737373]">({group.items.length})</span>
                                                                                        </div>
                                                                                        <span className="text-xs font-mono tabular-nums" style={{ color: group.color }}>{group.total}h</span>
                                                                                    </div>
                                                                                    {group.items.length === 0 ? (
                                                                                        <div className="text-[11px] text-[#737373] py-2">No tickets</div>
                                                                                    ) : (
                                                                                        <ul className="space-y-1.5">
                                                                                            {group.items.map(t => (
                                                                                                <li key={t.id} className="flex items-start gap-2 text-xs">
                                                                                                    <span className="font-mono text-[#E0B954] mt-0.5 flex-shrink-0">{t.key}</span>
                                                                                                    <div className="flex-1 min-w-0">
                                                                                                        <div className="text-white truncate">{t.title}</div>
                                                                                                        <div className="text-[10px] text-[#737373] mt-0.5 flex items-center gap-1.5 flex-wrap">
                                                                                                            <span>{t.project_name || `project ${t.project_id}`}</span>
                                                                                                            <span className="text-[rgba(255,255,255,0.15)]">·</span>
                                                                                                            <span>est {t.estimated_hours}h</span>
                                                                                                            <span className="text-[rgba(255,255,255,0.15)]">·</span>
                                                                                                            <span>logged {t.logged_hours}h</span>
                                                                                                            {t.counted_basis === 'remaining (transferred)' && (
                                                                                                                <span className="px-1 py-0.5 rounded bg-[#FBBF24]/15 text-[#FBBF24] text-[9px] font-semibold uppercase tracking-wider">transferred</span>
                                                                                                            )}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                    <span className="font-mono tabular-nums flex-shrink-0" style={{ color: group.color }} title={`Counted as ${t.counted_basis}`}>
                                                                                                        +{t.counted_hours}h
                                                                                                    </span>
                                                                                                </li>
                                                                                            ))}
                                                                                        </ul>
                                                                                    )}
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
                                </div>
                            </div>
                        )}

                        {/* Projects Tab */}
                        {activeTab === 'projects' && (
                            <div className="space-y-4">
                                <h2 className="text-lg font-semibold text-white">All Projects</h2>
                                <div className="grid grid-cols-3 gap-4">
                                    {projects.map(project => (
                                        <div
                                            key={project.id}
                                            className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl p-5 hover:border-[rgba(224,185,84,0.3)] transition-colors"
                                        >
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="cursor-pointer flex-1" onClick={() => navigate(`/project/${project.id}`)}>
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
                                                                <CheckCircle2 className="w-3 h-3" />Token
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
                                                    <span className="text-[10px] text-[#737373]">No GitHub repo configured</span>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-4 mt-4 text-xs text-[#737373]">
                                                <div className="flex items-center gap-1">
                                                    <Users className="w-3.5 h-3.5" />
                                                    {project.developer_count}
                                                </div>
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
                                <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl overflow-visible">
                                    <table className="w-full">
                                        <thead className="bg-[rgba(255,255,255,0.02)]">
                                            <tr>
                                                <th className="text-left text-xs font-medium text-[#737373] py-3 px-4">User</th>
                                                <th className="text-left text-xs font-medium text-[#737373] py-3 px-4">Roles</th>
                                                <th className="text-left text-xs font-medium text-[#737373] py-3 px-4">Status</th>
                                                <th className="text-left text-xs font-medium text-[#737373] py-3 px-4">Last Login</th>
                                                <th className="text-left text-xs font-medium text-[#737373] py-3 px-4">Restrictions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[rgba(255,255,255,0.03)]">
                                            {users.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(user => (
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
                                                            {user.role.split(',').slice(0, 2).map((r, i) => {
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
                                                                        {role === 'project_manager' && <UserCog className="w-3 h-3" />}
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
                                                            : 'Never'
                                                        }
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
                                </div>
                            </div>
                        )}
                        {/* Custom Restrictions Tab */}
                        {activeTab === 'custom-restrictions' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-semibold text-white">Custom Restrictions Management</h2>
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
                                                <th className="text-left text-xs font-medium text-[#737373] py-3 px-4">Name</th>
                                                <th className="text-left text-xs font-medium text-[#737373] py-3 px-4">Tab</th>
                                                <th className="text-left text-xs font-medium text-[#737373] py-3 px-4">Subsection</th>
                                                <th className="text-left text-xs font-medium text-[#737373] py-3 px-4">Created</th>
                                                <th className="text-right text-xs font-medium text-[#737373] py-3 px-4">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[rgba(255,255,255,0.03)]">
                                            {customRestrictions.map(restriction => (
                                                <tr key={restriction.id} className="hover:bg-[rgba(255,255,255,0.02)]">
                                                    <td className="py-3 px-4">
                                                        <span className="inline-flex items-center gap-2 px-2 py-1 rounded text-xs bg-[#E0B954]/20 text-[#E0B954]">
                                                            <Shield className="w-3 h-3" />
                                                            {restriction.name}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-sm text-[#a3a3a3]">{toPascalCase(restriction.tab_name)}</td>
                                                    <td className="py-3 px-4 text-sm text-[#a3a3a3]">{restriction.subsection}</td>
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
            {openRoleDropdown && users.find(u => u.id === openRoleDropdown) && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setOpenRoleDropdown(null)}>
                    <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
                            <h2 className="text-lg font-bold text-white">
                                Edit Roles - {users.find(u => u.id === openRoleDropdown)?.name}
                            </h2>
                            <button 
                                onClick={() => setOpenRoleDropdown(null)}
                                className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 space-y-3">
                            {['admin', 'project_manager', 'developer'].map(role => {
                                const user = users.find(u => u.id === openRoleDropdown);
                                const isChecked = user?.role.includes(role) || false;
                                return (
                                    <label key={role} className="flex items-center gap-3 p-3 rounded-lg hover:bg-[rgba(255,255,255,0.02)] cursor-pointer transition">
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
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowRestrictionModal(false)}>
                    <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
                            <h2 className="text-lg font-bold text-white">
                                {editingRestriction ? 'Edit Restriction' : 'Add Custom Restriction'}
                            </h2>
                            <button onClick={() => setShowRestrictionModal(false)} className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="text-xs font-medium text-[#737373] block mb-1.5">Restriction Name *</label>
                                <Input
                                    value={restrictionForm.name}
                                    onChange={e => setRestrictionForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="e.g., NoWorkload, NoAnalytics"
                                    className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-[#737373] block mb-1.5">Tab Name *</label>
                                <select
                                    value={restrictionForm.tab_name}
                                    onChange={e => setRestrictionForm(f => ({ ...f, tab_name: e.target.value }))}
                                    className="w-full bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10 px-3 text-sm"
                                >
                                    <option value="">Select a tab...</option>
                                    <option value="project_manager">Project Manager</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-[#737373] block mb-1.5">Subsection *</label>
                                <Input
                                    value={restrictionForm.subsection}
                                    onChange={e => setRestrictionForm(f => ({ ...f, subsection: e.target.value }))}
                                    placeholder="e.g., workload, analytics, timeline"
                                    className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                                />
                                <p className="text-[10px] text-[#737373] mt-1">
                                    The subsection within the tab that will be hidden from users with this restriction.
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
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowEmployeeModal(false)}>
                    <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
                            <h2 className="text-lg font-bold text-white">
                                {editingEmployee ? 'Edit Employee' : 'Add Employee'}
                            </h2>
                            <button onClick={() => setShowEmployeeModal(false)} className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="text-xs font-medium text-[#737373] block mb-1.5">Name *</label>
                                <Input
                                    value={employeeForm.name}
                                    onChange={e => setEmployeeForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="John Doe"
                                    className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-[#737373] block mb-1.5">Email *</label>
                                <Input
                                    type="email"
                                    value={employeeForm.email}
                                    onChange={e => setEmployeeForm(f => ({ ...f, email: e.target.value }))}
                                    placeholder="john@company.com"
                                    className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-[#737373] block mb-1.5">GitHub Username</label>
                                <Input
                                    value={employeeForm.github_username}
                                    onChange={e => setEmployeeForm(f => ({ ...f, github_username: e.target.value }))}
                                    placeholder="johndoe"
                                    className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-[#737373] block mb-1.5">Specialization</label>
                                <select
                                    value={employeeForm.specialization}
                                    onChange={e => setEmployeeForm(f => ({ ...f, specialization: e.target.value }))}
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
                            <Button variant="ghost" onClick={() => setShowEmployeeModal(false)} className="text-[#737373] rounded-xl px-5">Cancel</Button>
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
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowUserModal(false)}>
                    <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
                            <h2 className="text-lg font-bold text-white">Add New User</h2>
                            <button onClick={() => setShowUserModal(false)} className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            {generatedPassword ? (
                                <div className="space-y-4">
                                    <div className="p-4 bg-[rgba(224,185,84,0.1)] border border-[rgba(224,185,84,0.2)] rounded-xl">
                                        <p className="text-sm text-[#E0B954] font-medium mb-2">User Created Successfully!</p>
                                        <p className="text-xs text-[#a3a3a3] mb-2">Share this temporary password with the user:</p>
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
                                        <label className="text-xs font-medium text-[#737373] block mb-1.5">Name *</label>
                                        <Input
                                            value={userForm.name}
                                            onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))}
                                            placeholder="John Doe"
                                            className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-[#737373] block mb-1.5">Email *</label>
                                        <Input
                                            type="email"
                                            value={userForm.email}
                                            onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))}
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
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowUserRestrictionsModal(false)}>
                    <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
                            <div>
                                <h2 className="text-lg font-bold text-white">Manage Restrictions</h2>
                                <p className="text-xs text-[#737373] mt-0.5">{selectedUserForRestrictions.name}</p>
                            </div>
                            <button onClick={() => setShowUserRestrictionsModal(false)} className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 space-y-2 max-h-96 overflow-y-auto">
                            {userRestrictionsLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <div className="animate-spin w-6 h-6 border-2 border-[#E0B954] border-t-transparent rounded-full" />
                                </div>
                            ) : customRestrictions.length === 0 ? (
                                <p className="text-sm text-[#737373] text-center py-8">No custom restrictions available</p>
                            ) : (
                                customRestrictions.map(restriction => (
                                    <label key={restriction.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-[rgba(255,255,255,0.02)] cursor-pointer transition">
                                        <input
                                            type="checkbox"
                                            checked={userRestrictionsList.includes(restriction.id)}
                                            onChange={e => handleToggleUserRestriction(restriction.id, e.target.checked)}
                                            className="w-5 h-5 rounded cursor-pointer"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <span className="text-sm text-white font-medium block">{restriction.name}</span>
                                            <p className="text-xs text-[#737373] mt-0.5">
                                                {toPascalCase(restriction.tab_name)} → {toPascalCase(restriction.subsection)}
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
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowGitHubModal(false)}>
                    <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
                            <div>
                                <h2 className="text-lg font-bold text-white">GitHub Settings</h2>
                                <p className="text-xs text-[#737373] mt-0.5">{editingProject.name}</p>
                            </div>
                            <button onClick={() => setShowGitHubModal(false)} className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="text-xs font-medium text-[#737373] block mb-1.5">Repository URL</label>
                                <Input
                                    value={gitHubForm.github_repo_url}
                                    onChange={e => setGitHubForm(f => ({ ...f, github_repo_url: e.target.value }))}
                                    placeholder="https://github.com/org/repo"
                                    className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-[#737373] block mb-1.5">Repository Name (org/repo)</label>
                                <Input
                                    value={gitHubForm.github_repo_name}
                                    onChange={e => setGitHubForm(f => ({ ...f, github_repo_name: e.target.value }))}
                                    placeholder="myorg/myrepo"
                                    className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-[#737373] block mb-1.5">GitHub Token</label>
                                <Input
                                    type="password"
                                    value={gitHubForm.github_token}
                                    onChange={e => setGitHubForm(f => ({ ...f, github_token: e.target.value }))}
                                    placeholder={editingProject.has_github_token ? "Token already set (leave empty to keep)" : "ghp_xxxx..."}
                                    className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-10"
                                />
                                <p className="text-[10px] text-[#737373] mt-1">
                                    Token needs repo scope for invitations. Leave empty to keep existing token.
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 p-5 border-t border-[rgba(255,255,255,0.05)]">
                            <Button variant="ghost" onClick={() => setShowGitHubModal(false)} className="text-[#737373] rounded-xl px-5">Cancel</Button>
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

            {/* Employee In-Progress Tickets Modal */}
            {showEmployeeTicketsModal && selectedEmployee && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowEmployeeTicketsModal(false)}>
                    <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
                            <div>
                                <h2 className="text-lg font-bold text-white">In-Progress Tickets</h2>
                                <p className="text-xs text-[#737373] mt-0.5">{selectedEmployee.name} • {employeeTickets.length} ticket{employeeTickets.length !== 1 ? 's' : ''}</p>
                            </div>
                            <button onClick={() => setShowEmployeeTicketsModal(false)} className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-5 max-h-96 overflow-y-auto">
                            {ticketsLoading ? (
                                <div className="flex items-center justify-center py-10">
                                    <div className="w-5 h-5 border-2 border-[#E0B954]/30 border-t-[#E0B954] rounded-full animate-spin" />
                                </div>
                            ) : employeeTickets.length === 0 ? (
                                <div className="text-center py-8 text-[#737373]">
                                    <Ticket className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    <p>No in-progress tickets</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {employeeTickets.map(ticket => {
                                        const priorityColor = ticket.priority.toLowerCase() === 'critical' ? '#EF4444'
                                            : ticket.priority.toLowerCase() === 'high' ? '#F97316'
                                            : ticket.priority.toLowerCase() === 'medium' ? '#F59E0B'
                                            : '#E0B954';
                                        
                                        // Truncate description to 80 characters
                                        const truncatedDescription = ticket.description
                                            ? ticket.description.length > 80
                                                ? ticket.description.substring(0, 80) + '...'
                                                : ticket.description
                                            : '';
                                        
                                        return (
                                            <div key={ticket.id} className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-lg p-4 hover:border-[rgba(255,255,255,0.08)] transition">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <button
                                                                onClick={() => {
                                                                    window.open(`/project/${ticket.project_id}/board/${ticket.id}`, '_blank');
                                                                }}
                                                                className="text-sm font-medium text-[#E0B954] hover:text-white hover:underline transition text-left"
                                                            >
                                                                {ticket.title}
                                                            </button>
                                                            <span
                                                                className="px-2 py-0.5 rounded text-xs font-medium text-white whitespace-nowrap"
                                                                style={{ backgroundColor: `${priorityColor}30`, color: priorityColor }}
                                                            >
                                                                {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
                                                            </span>
                                                        </div>
                                                        {truncatedDescription && (
                                                            <p className="text-xs text-[#a3a3a3] mb-2" title={ticket.description ?? undefined}>{truncatedDescription}</p>
                                                        )}
                                                        <div className="flex items-center justify-between mt-2 text-xs">
                                                            <div className="flex items-center gap-4 text-[#737373]">
                                                                <button
                                                                    onClick={() => window.open(`/project/${ticket.project_id}`, '_blank')}
                                                                    className="font-bold text-[#E0B954] hover:text-white hover:underline transition"
                                                                >
                                                                    {ticket.project_name}
                                                                </button>
                                                            
                                                            </div>
                                                            {ticket.estimated_hours !== null && (
                                                                <span className="bg-[rgba(224,185,84,0.1)] text-[#E0B954] px-2 py-0.5 rounded whitespace-nowrap">
                                                                    {Math.max(0, ticket.estimated_hours - ticket.logged_hours)}h left
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;
