import { toast } from 'sonner';

/**
 * Factory for the repeated react-query mutation `onError` shape: surface the
 * backend's error message when present, otherwise a generic "Failed to <action>".
 * Replaces ~35 hand-rolled copies of the same handler.
 *
 *   const m = useMutation({ mutationFn, onError: toastErrorHandler('update task') });
 */
export function toastErrorHandler(action: string) {
  return (err: unknown) => {
    const message = err instanceof Error && err.message ? err.message : `Failed to ${action}`;
    toast.error(message);
  };
}
