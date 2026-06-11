import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';
import type { MyCapacityResponse, ProjectGroup } from './types';
import { WEEKLY_CAPACITY } from './types';
import CapacityTile from './components/CapacityTile';
import CapacityModal from './components/CapacityModal';

/**
 * Compact dashboard tile showing the logged-in user's weekly capacity.
 * Click opens a modal with the full project + ticket breakdown — same shape
 * as a row in the admin Employees tab.
 */
const MyCapacityCard = () => {
  const [open, setOpen] = useState(false);

  const { data, isLoading, error } = useQuery<MyCapacityResponse>({
    queryKey: ['myCapacity'],
    queryFn: () => apiFetch('/api/developers/me/capacity'),
    retry: (failureCount, err) => {
      if (err instanceof ApiError && err.status === 404) return false;
      return failureCount < 2;
    },
  });

  // Hide silently for users with no developer profile.
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
