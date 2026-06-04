import { lazy, Suspense, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Users, FolderKanban, ArrowLeft, BarChart3, Shield, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toaster } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import type { AdminTab } from './types';
import { VALID_ADMIN_TABS } from './types';
import { AdminSpinner } from './components/AdminSpinner';

// Each tab is a self-contained container that owns its own data hooks, mutations,
// and modal/form state. Lazy-loading keeps every tab's chunk — and its heavy
// deps (e.g. recharts inside DashboardContainer) — off the /admin critical path;
// a container's chunk downloads on first view, in parallel with its data fetch.
// Because a container only mounts when its tab is active, mounting also gates
// data fetching (no `enabled` flags needed) and scopes re-renders: typing in a
// tab's form re-renders only that container.
const DashboardContainer = lazy(() => import('./containers/DashboardContainer'));
const EmployeesContainer = lazy(() => import('./containers/EmployeesContainer'));
const ProjectsContainer = lazy(() => import('./containers/ProjectsContainer'));
const UsersContainer = lazy(() => import('./containers/UsersContainer'));
const RolesContainer = lazy(() => import('./containers/RolesContainer'));

/**
 * Admin shell. Owns only tab selection + URL sync and capability gating; each
 * tab's data, mutations, and modal state live in its container (./containers/*).
 */
const AdminDashboard = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can } = useAuth();

  // Per-tab capability gates. The /admin route guard in App.tsx already ensures
  // the user holds at least one admin.* capability before this component mounts;
  // these gates control which tabs they actually see and protect against
  // URL-direct access (?tab=users) for caps the user lacks.
  const canSeeDashboard = can('admin.dashboard');
  const canSeeEmployees = can('admin.employees');
  const canSeeProjects = can('admin.projects');
  const canSeeUsers = can('admin.users');
  const canSeeRoles = can('admin.roles');

  // Land on the first tab the user can actually see (in tab-bar order) rather
  // than always defaulting to Dashboard — a user without `admin.dashboard` would
  // otherwise open /admin to a "restricted" pane despite having other tabs.
  const firstVisibleTab: AdminTab = canSeeDashboard
    ? 'dashboard'
    : canSeeEmployees
      ? 'employees'
      : canSeeProjects
        ? 'projects'
        : canSeeUsers
          ? 'users'
          : canSeeRoles
            ? 'roles'
            : 'dashboard';

  const tabFromUrl = searchParams.get('tab');
  const initialTab: AdminTab =
    tabFromUrl && (VALID_ADMIN_TABS as string[]).includes(tabFromUrl)
      ? (tabFromUrl as AdminTab)
      : firstVisibleTab;
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
        : firstVisibleTab;
    if (resolved !== activeTab) {
      setActiveTabState(resolved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const restricted = (
    <div className="text-center py-12 text-[#737373]">This section is restricted.</div>
  );

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

      {/* Content. Each tab is a lazy container that owns its data + modals; the
          Suspense fallback covers chunk load, the container its own data spinner. */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <Suspense fallback={<AdminSpinner />}>
          {activeTab === 'dashboard' &&
            (canSeeDashboard ? <DashboardContainer setActiveTab={setActiveTab} /> : restricted)}
          {activeTab === 'employees' && (canSeeEmployees ? <EmployeesContainer /> : restricted)}
          {activeTab === 'projects' && (canSeeProjects ? <ProjectsContainer /> : restricted)}
          {activeTab === 'users' && (canSeeUsers ? <UsersContainer /> : restricted)}
          {activeTab === 'roles' && (canSeeRoles ? <RolesContainer /> : restricted)}
        </Suspense>
      </div>
    </div>
  );
};

export default AdminDashboard;
