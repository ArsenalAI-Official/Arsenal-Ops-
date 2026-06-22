import type { SprintResponse } from '@/client';
import { parseLocalDate } from './listGrouping';

export interface SprintFormValues {
  name: string;
  goal: string;
  start_date: string;
  end_date: string;
}

export interface ValidateSprintFormArgs {
  form: SprintFormValues;
  sprints: SprintResponse[];
  // When editing, exclude the sprint being edited from the duplicate-name and
  // overlap checks. Omit/undefined when creating.
  excludeSprintId?: number;
  // The overlap-rejection message differs between create and edit, so it's
  // injected to keep behavior byte-identical for each caller.
  overlapMessage: string;
}

// Shared duplicate-name + date-presence + date-order + overlap validation used
// by BOTH handleCreateSprint and handleEditSprint. Returns the error string the
// handler should toast, or null when the form is valid.
//
// NOTE: the empty-name check is intentionally NOT included here — the two
// handlers guard it differently (create checks only `!form.name.trim()`; edit
// also requires `editingSprint`), so each caller keeps its own name guard and
// calls this for the remaining shared checks.
export const validateSprintForm = ({
  form,
  sprints,
  excludeSprintId,
  overlapMessage,
}: ValidateSprintFormArgs): string | null => {
  const duplicateName = sprints.some(
    (s) =>
      s.id !== excludeSprintId && s.name.trim().toLowerCase() === form.name.trim().toLowerCase(),
  );
  if (duplicateName) {
    return 'A sprint with this name already exists';
  }
  if (!form.start_date) {
    return 'Start date is required';
  }
  if (!form.end_date) {
    return 'End date is required';
  }
  const startDate = parseLocalDate(form.start_date);
  const endDate = parseLocalDate(form.end_date);
  if (startDate && endDate && endDate < startDate) {
    return 'End date must be equal to or after start date';
  }
  if (startDate && endDate) {
    const hasOverlap = sprints.some((s) => {
      if (s.id === excludeSprintId || !s.start_date || !s.end_date) return false;
      return startDate <= new Date(s.end_date) && endDate >= new Date(s.start_date);
    });
    if (hasOverlap) {
      return overlapMessage;
    }
  }
  return null;
};
