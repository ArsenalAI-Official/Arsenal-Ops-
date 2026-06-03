import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from 'react-router-dom';
import { useState, useEffect, lazy, Suspense, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Login } from './components/Login';
import { PasswordChange } from './components/PasswordChange';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock } from 'lucide-react';
import { queryClient } from '@/lib/queryClient';
import './App.css';

// Heavy routes are code-split so the initial bundle stays light.
// Each chunk loads on demand when the user navigates to that route.
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const PersonalTasksPage = lazy(() => import('./pages/PersonalTasksPage'));
const ProjectBoard = lazy(() => import('./pages/ProjectBoard'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));

const RouteSpinner = () => (
  <div className="min-h-screen bg-[#080808] flex items-center justify-center">
    <div className="w-10 h-10 border-2 border-[#E0B954]/30 border-t-[#E0B954] rounded-full animate-spin" />
  </div>
);

import { hasAnyAdminCapability } from '@/lib/adminCaps';

/**
 * Route guard for /admin. Renders children only when the user holds at least
 * one admin.* capability. Otherwise redirects to the projects home so users
 * can't see the admin shell at all. Backend endpoints are independently
 * gated, so this is defense-in-depth on the client.
 *
 * The admin-cap list itself lives in `lib/adminCaps.ts` so this guard and
 * every Admin-nav-link visibility check stay in sync.
 */
function RequireAnyAdminCapability({ children }: { children: ReactNode }) {
  const { can } = useAuth();
  if (hasAnyAdminCapability(can)) return <>{children}</>;
  return <Navigate to="/" replace />;
}

function IdleWarningModal({
  onStay,
  onLogout,
  remainingSeconds,
}: {
  onStay: () => void;
  onLogout: () => void;
  remainingSeconds: number;
}) {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-[#F59E0B]/20 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-[#F59E0B]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Session Timeout Warning</h2>
            <p className="text-sm text-[#737373]">You have been inactive for 25 minutes</p>
          </div>
        </div>

        <div className="bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.2)] rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 text-[#F59E0B] mb-2">
            <Clock className="w-4 h-4" />
            <span className="font-medium">Auto-logout in:</span>
          </div>
          <div className="text-3xl font-bold text-white tabular-nums">
            {minutes}:{seconds.toString().padStart(2, '0')}
          </div>
          <p className="text-xs text-[#a3a3a3] mt-2">
            You will be automatically logged out due to inactivity.
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            variant="ghost"
            onClick={onLogout}
            className="flex-1 text-[#737373] hover:text-white rounded-xl h-11"
          >
            Logout Now
          </Button>
          <Button
            onClick={onStay}
            className="flex-1 bg-gradient-to-r from-[#E0B954] to-[#B8872A] hover:from-[#C79E3B] hover:to-[#B8872A] text-white rounded-xl h-11 font-medium"
          >
            Stay Logged In
          </Button>
        </div>
      </div>
    </div>
  );
}

function AuthenticatedRoutes() {
  const { user, isLoading, isAuthenticated, showWarning, dismissWarning, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [countdown, setCountdown] = useState(300); // 5 minutes in seconds

  // Store intended destination before redirecting to login
  useEffect(() => {
    if (!isLoading && !isAuthenticated && location.pathname !== '/login') {
      localStorage.setItem('intendedPath', location.pathname + location.search);
      navigate('/login');
    }
  }, [isAuthenticated, isLoading, navigate, location]);

  // After login, redirect to intended destination
  useEffect(() => {
    if (!isLoading && isAuthenticated && location.pathname === '/login') {
      const intendedPath = localStorage.getItem('intendedPath') || '/';
      localStorage.removeItem('intendedPath');
      navigate(intendedPath);
    }
  }, [isAuthenticated, isLoading, navigate, location]);

  // Countdown timer for warning modal
  useEffect(() => {
    if (!showWarning) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset to initial value when modal closes
      setCountdown(300);
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev: number) => {
        if (prev <= 1) {
          logout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [showWarning, logout]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-[#E0B954]/30 border-t-[#E0B954] rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  // If first login, force password change
  if (user?.is_first_login) {
    return <PasswordChange />;
  }

  return (
    <>
      {showWarning && (
        <IdleWarningModal onStay={dismissWarning} onLogout={logout} remainingSeconds={countdown} />
      )}
      <Suspense fallback={<RouteSpinner />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/personal-tasks" element={<PersonalTasksPage />} />
          <Route path="/project/:id" element={<ProjectDetail />} />
          <Route path="/project/:id/board" element={<ProjectBoard />} />
          <Route path="/project/:id/board/:ticketId" element={<ProjectBoard />} />
          <Route
            path="/admin"
            element={
              <RequireAnyAdminCapability>
                <AdminDashboard />
              </RequireAnyAdminCapability>
            }
          />
        </Routes>
      </Suspense>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <AuthProvider>
          <AuthenticatedRoutes />
        </AuthProvider>
      </Router>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}

export default App;
