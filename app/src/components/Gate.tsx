import { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface GateProps {
  /** Capability key required to render children (e.g. "project.tracker.analytics"). */
  cap: string;
  /** What to render when the user lacks the capability. Defaults to null (hidden). */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Conditionally render children based on an RBAC capability.
 *
 *   <Gate cap="project.tracker.analytics">
 *     <AnalyticsBlock />
 *   </Gate>
 *
 * For non-JSX conditions (filtering arrays, computing booleans), use
 * `const { can } = useAuth()` directly.
 */
export function Gate({ cap, fallback = null, children }: GateProps) {
  const { can } = useAuth();
  return <>{can(cap) ? children : fallback}</>;
}
