import type { QueryClient } from '@tanstack/react-query';

/**
 * Invalidate every cache that mirrors data from a single project.
 * Includes the bundled `projectOverview` so the seeding effect in
 * ProjectDetail can't overwrite freshly invalidated per-resource caches.
 */
export function invalidateProjectScope(
  queryClient: QueryClient,
  projectId: number | string | undefined,
) {
  if (projectId === undefined || projectId === null) return;
  const id = projectId;
  queryClient.invalidateQueries({ queryKey: ['project', id] });
  queryClient.invalidateQueries({ queryKey: ['project', id, 'links'] });
  queryClient.invalidateQueries({ queryKey: ['projectOverview', id] });
  queryClient.invalidateQueries({ queryKey: ['sprints', id] });
  queryClient.invalidateQueries({ queryKey: ['hubData', id, 'goals'] });
  queryClient.invalidateQueries({ queryKey: ['hubData', id, 'milestones'] });
  queryClient.invalidateQueries({ queryKey: ['hubData', id, 'activities'] });
  queryClient.invalidateQueries({ queryKey: ['hubData', id, 'analytics'] });
  queryClient.invalidateQueries({ queryKey: ['hubData', id, 'prd'] });
  invalidateAdminProjectImpact(queryClient);
}

/**
 * Invalidate every cache that mirrors work-item data for a project.
 * Includes board+hub workitem lists, myTasks, single-item detail prefix,
 * and the analytics + activities hub caches that change when work items move.
 */
export function invalidateWorkItemScope(
  queryClient: QueryClient,
  projectId: number | string | undefined,
) {
  queryClient.invalidateQueries({ queryKey: ['workItems'] }); // prefix matches board+hub
  queryClient.invalidateQueries({ queryKey: ['workItem'] }); // prefix matches all single-item detail/comments
  queryClient.invalidateQueries({ queryKey: ['myTasks'] });
  if (projectId !== undefined && projectId !== null) {
    queryClient.invalidateQueries({ queryKey: ['hubData', projectId, 'analytics'] });
    queryClient.invalidateQueries({ queryKey: ['hubData', projectId, 'activities'] });
    queryClient.invalidateQueries({ queryKey: ['projectOverview', projectId] });
  }
  invalidateAdminWorkItemImpact(queryClient);
}

/**
 * Admin dashboard cache invalidation helpers. Use these alongside the per-scope
 * helpers to keep the admin views fresh after operational writes.
 *
 * Each is granular by intent so we don't refetch unrelated admin tabs on every
 * Kanban drag (refetching roles/users/capabilities on a status change is wasteful).
 */
export function invalidateAdminWorkItemImpact(queryClient: QueryClient) {
  // any workitem create/update/delete/move/log-hours/status-change
  queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
  queryClient.invalidateQueries({ queryKey: ['admin', 'developers-capacity'] });
}

export function invalidateAdminProjectImpact(queryClient: QueryClient) {
  // any project create/update/delete or membership change
  queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
  queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
}

export function invalidateAdminMembershipImpact(queryClient: QueryClient) {
  // project member add/remove (also unassigns workitems on backend, so capacity moves)
  queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
  queryClient.invalidateQueries({ queryKey: ['admin', 'developers-capacity'] });
  queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
}

export function invalidateAdminUserRoleImpact(queryClient: QueryClient) {
  // user create / role assign/remove — developer role toggles employee surfacing
  queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
  queryClient.invalidateQueries({ queryKey: ['admin', 'employees'] });
  queryClient.invalidateQueries({ queryKey: ['admin', 'developers-capacity'] });
}

export function invalidateAdminRoles(queryClient: QueryClient) {
  // role CRUD or per-user role assignment — users carry their role list, so both
  // the roles registry and the users list go stale together. Shared by
  // useRolesAdmin and useUserRoleAssignment so the pair can't drift.
  queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
  queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
}
