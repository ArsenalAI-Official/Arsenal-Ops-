import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch, ApiError } from '@/lib/api';
import CapacityModal from './components/CapacityModal';
import CapacityTile from './components/CapacityTile';
import type { MyCapacityResponse, ProjectGroup } from './types';
import { WEEKLY_CAPACITY } from './types';

/**
 * Compact dashboard tile showing the logged-in user's weekly capacity.
 * Click opens a modal with the full project + ticket breakdown — same shape
 * as a row in the admin Employees tab.
 *
 * Gated to internal employees only — `user.is_external` is sourced from
 * the linked Developer row (driven by `ALLOWED_EMAIL_DOMAINS` on the
 * backend). External contractors / no-Developer admins never render
 * the card OR fire the capacity request.
 */
const MyCapacityCard = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  // Short-circuit BEFORE the query fires for external users. Belt-and-
  // suspenders: the backend would also 404 them, but gating here means
  // no loading-state flicker and one fewer request per page load.
  const isExternal = user?.is_external === true;

  const { data, isLoading, error } = useQuery<MyCapacityResponse>({
    queryKey: ['myCapacity'],
    queryFn: () => apiFetch('/api/developers/me/capacity'),
    enabled: !isExternal,
    retry: (failureCount, err) => {
      if (err instanceof ApiError && err.status === 404) return false;
      return failureCount < 2;
    },
  });

  if (isExternal) return null;

  // Hide silently for users with no developer profile (admin-only users,
  // legacy localStorage caches without `is_external`).
  if (error instanceof ApiError && error.status === 404) return null;

  const used = data?.this_week_capacity_used ?? 0;
  const remaining = data?.this_week_remaining_capacity ?? WEEKLY_CAPACITY;
  const status: 'Available' | 'Moderate' | 'Busy' =
    remaining >= 10 ? 'Available' : remaining > 0 ? 'Moderate' : 'Busy';
  const statusColor =
    status === 'Available' ? '#34D399' : status === 'Moderate' ? '#F59E0B' : '#EF4444';

  // Total hours I actually logged this week across every project.
  const totalLoggedThisWeek = (data?.tickets ?? []).reduce(
    (s, t) => s + (t.your_logged_this_week ?? 0),
    0,
  );

  // Group contributing tickets by project for the modal detail view.
  const projectGroupsMap = (data?.tickets ?? []).reduce<Record<number, ProjectGroup>>((acc, t) => {
    const pid = t.project_id;
    if (!acc[pid]) {
      acc[pid] = {
        projectId: pid,
        projectName: t.project_name || `Project ${pid}`,
        tickets: [],
        total: 0,
      };
    }
    acc[pid].tickets.push(t);
    acc[pid].total += t.counted_hours;
    return acc;
  }, {});
  const projectsByHours = Object.values(projectGroupsMap).sort((a, b) => b.total - a.total);

  return (
    <>
      <CapacityTile
        isLoading={isLoading}
        hasData={!!data}
        statusColor={statusColor}
        used={used}
        totalLoggedThisWeek={totalLoggedThisWeek}
        onClick={() => !isLoading && data && setOpen(true)}
      />

      <CapacityModal
        open={open}
        onOpenChange={setOpen}
        data={data}
        used={used}
        status={status}
        statusColor={statusColor}
        totalLoggedThisWeek={totalLoggedThisWeek}
        projectsByHours={projectsByHours}
      />
    </>
  );
};

export default MyCapacityCard;
