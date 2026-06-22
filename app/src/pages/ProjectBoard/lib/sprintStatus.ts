import type { SprintResponse } from '@/client';

// Pure predicates extracted from the `isSprintCompleted` / `isSprintActive`
// useCallbacks in ProjectBoard. `today` is the YYYY-MM-DD string the component
// computes once per mount (`new Date().toISOString().split('T')[0]`).
export const isSprintCompleted = (s: SprintResponse, today: string): boolean =>
  s.status === 'completed' || (s.end_date != null && s.end_date < today);

export const isSprintActive = (s: SprintResponse, today: string): boolean =>
  s.status === 'active' ||
  (s.start_date != null && s.start_date <= today && s.end_date != null && s.end_date >= today);
