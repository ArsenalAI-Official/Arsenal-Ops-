import { lazy, Suspense, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Users, FolderKanban, ArrowLeft, BarChart3, Shield, KeyRound, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toaster } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import type { AdminTab } from './types';
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
const TimeEntriesContainer = lazy(() => import('./containers/TimeEntriesContainer'));
const UsersContainer = lazy(() => import('./containers/UsersContainer'));
const RolesContainer = lazy(() => import('./containers/RolesContainer'));

/**
 * Tab order + the capability that gates each. Order drives both the tab-strip
 * left-to-right and the "first allowed tab" fallback in `resolveAdminTab` —
 * keep aligned with the picker catalog's Admin section in `capabilityPicker`.
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
 * `useState` lazy initializer (correct on first paint) and the URL-sync effect
 * (correct on browser back/forward and when caps resolve after mount).
 *
 * Rules:
 *   - If the URL specifies a tab and the user has its cap → use it.
 *   - Else fall back to the FIRST tab in `ADMIN_TAB_CAPS` the user can see.
 *   - Else 'dashboard' as a defensive last resort — shouldn't happen because
 *     the /admin route guard requires at least one admin.* cap before mount,
 *     but keeps the return type honest if caps drift mid-session.
 */
function resolveAdminTab(urlTab: string | null, hasAccess: (cap: string) => boolean): AdminTab {
  if (urlTab) {
    const requested = ADMIN_TAB_CAPS.find((t) => t.id === urlTab);
    if (requested && hasAccess(requested.cap)) return requested.id;
  }
  const firstAllowed = ADMIN_TAB_CAPS.find((t) => hasAccess(t.cap));
  return firstAllowed ? firstAllowed.id : 'dashboard';
}

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
  const canSeeTimeEntries = can('admin.time_entries');
  const canSeeUsers = can('admin.users');
  const canSeeRoles = can('admin.roles');

  // Lazy initializer so we read `can` exactly once on mount: if the URL points
  // at a tab the user can see → use it; otherwise fall back to the first tab
  // they can see (skipping a flash of the "restricted" splash).
  const tabFromUrl = searchParams.get('tab');
  const [activeTab, setActiveTabState] = useState<AdminTab>(() => resolveAdminTab(tabFromUrl, can));

  const setActiveTab = (tab: AdminTab) => {
    setActiveTabState(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === 'dashboard') {
      next.delete('tab');
    } else {
      next.set('tab', tab);
    }
    setSearchParams(next, { replace: false });
  };

  // Sync state with URL on browser back/forward, and self-correct when the URL
  // points at a tab the user can't see (or no tab and they lack
  // `admin.dashboard`). `can` is in the deps so a capability resolution *after*
  // mount re-resolves the tab — without it a user could be parked on a stale
  // fallback (e.g. the restricted Dashboard pane) until they click a tab.
  // `activeTab` is deliberately omitted so the effect runs on URL/caps change,
  // not when state changes back.
  useEffect(() => {
    const urlTab = searchParams.get('tab');
    const resolved = resolveAdminTab(urlTab, can);
    if (resolved !== activeTab) {
      setActiveTabState(resolved);
    }
    // If the URL referred to a forbidden / unknown tab, rewrite it to match the
    // resolved tab so refresh + share both work. `replace: true` so this
    // self-correction doesn't litter browser history.
    const expectedUrlTab = resolved === 'dashboard' ? null : resolved;
    if (urlTab !== expectedUrlTab) {
      const next = new URLSearchParams(searchParams);
      if (expectedUrlTab === null) next.delete('tab');
      else next.set('tab', expectedUrlTab);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, can]);

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

      {/* Content. Each tab is a lazy container that owns its data + modals; the
          Suspense fallback covers chunk load, the container its own data spinner. */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <Suspense fallback={<AdminSpinner />}>
          {activeTab === 'dashboard' &&
            (canSeeDashboard ? <DashboardContainer setActiveTab={setActiveTab} /> : restricted)}
          {activeTab === 'employees' && (canSeeEmployees ? <EmployeesContainer /> : restricted)}
          {activeTab === 'projects' && (canSeeProjects ? <ProjectsContainer /> : restricted)}
          {activeTab === 'time_entries' &&
            (canSeeTimeEntries ? <TimeEntriesContainer /> : restricted)}
          {activeTab === 'users' && (canSeeUsers ? <UsersContainer /> : restricted)}
          {activeTab === 'roles' && (canSeeRoles ? <RolesContainer /> : restricted)}
        </Suspense>
      </div>
    </div>
  );
};

export default AdminDashboard;
