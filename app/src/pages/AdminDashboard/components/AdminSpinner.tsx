import { Spinner } from '@/components/ui/spinner';

/** Shared loading spinner for the admin tab containers and the shell's
 *  Suspense fallback. */
export const AdminSpinner = () => (
  <div className="flex items-center justify-center h-64">
    <Spinner size="md" />
  </div>
);
