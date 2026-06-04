/** Shared loading spinner for the admin tab containers and the shell's
 *  Suspense fallback. */
export const AdminSpinner = () => (
  <div className="flex items-center justify-center h-64">
    <div className="animate-spin w-8 h-8 border-2 border-[#E0B954] border-t-transparent rounded-full" />
  </div>
);
