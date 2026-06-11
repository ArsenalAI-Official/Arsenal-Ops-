import type { Sprint } from '@/types/workItems';

// Returns the id of the sprint immediately after the current one in the
// project's sprint list, or null when there's no current sprint, no sprints,
// or the current sprint is the last one.
export const getNextSprint = (currentSprintId: number | null, sprints: Sprint[]): number | null => {
  if (!currentSprintId || sprints.length === 0) return null;
  const currentIndex = sprints.findIndex((s) => s.id === currentSprintId);
  if (currentIndex >= 0 && currentIndex < sprints.length - 1) {
    return sprints[currentIndex + 1].id;
  }
  return null;
};
