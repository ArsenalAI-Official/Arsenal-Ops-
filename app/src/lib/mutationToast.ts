import { toast } from 'sonner';
import { permissionAwareError } from './api';

/**
 * Factory for the repeated react-query mutation `onError` shape. Permission
 * errors (403) collapse to a friendly "Do not have permission" (via
 * `permissionAwareError`); otherwise it surfaces the backend's error message
 * when present, falling back to a generic "Failed to <action>".
 *
 * Consolidates two duplicated patterns that converged in the merge: ~35
 * hand-rolled `toast.error(err.message ?? 'Failed to …')` copies and ~11
 * `toast.error(permissionAwareError(err, 'Failed to …'))` call sites.
 *
 *   const m = useMutation({ mutationFn, onError: toastErrorHandler('update task') });
 */
export function toastErrorHandler(action: string) {
  return (err: unknown) => {
    const fallback = err instanceof Error && err.message ? err.message : `Failed to ${action}`;
    toast.error(permissionAwareError(err, fallback));
  };
}
