/**
 * Loading skeleton for the board — extracted verbatim from ProjectBoard's
 * `if (isLoading) return (...)` block. Pure presentation: no props, no hooks.
 */
const BoardSkeleton = () => {
  return (
    <div className="min-h-screen bg-[#080808] text-[#F4F6FF]">
      {/* Skeleton Header */}
      <header className="border-b border-[rgba(255,255,255,0.05)] bg-[#080808]/90 sticky top-0 z-40">
        <div className="px-6 py-4 flex items-center gap-4">
          <div className="h-8 w-24 bg-[rgba(255,255,255,0.06)] rounded-lg animate-pulse" />
          <div className="h-8 w-48 bg-[rgba(255,255,255,0.04)] rounded-lg animate-pulse" />
          <div className="ml-auto flex gap-2">
            <div className="h-8 w-24 bg-[rgba(255,255,255,0.04)] rounded-lg animate-pulse" />
            <div className="h-8 w-24 bg-[rgba(255,255,255,0.06)] rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="px-6 pb-3 flex gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-3 w-16 bg-[rgba(255,255,255,0.04)] rounded animate-pulse" />
          ))}
        </div>
      </header>
      {/* Skeleton Board Columns */}
      <div className="flex gap-4 p-6">
        {[...Array(4)].map((_, col) => (
          <div key={col} className="flex-1 min-w-[260px]">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-4 w-24 bg-[rgba(255,255,255,0.06)] rounded animate-pulse" />
              <div className="h-4 w-6 bg-[rgba(255,255,255,0.04)] rounded-full animate-pulse" />
            </div>
            <div className="space-y-3">
              {[...Array(col === 0 ? 4 : col === 1 ? 3 : col === 2 ? 2 : 1)].map((_, i) => (
                <div
                  key={i}
                  className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-14 bg-[rgba(255,255,255,0.06)] rounded animate-pulse" />
                    <div className="h-3 w-10 bg-[rgba(255,255,255,0.04)] rounded animate-pulse ml-auto" />
                  </div>
                  <div className="h-4 w-full bg-[rgba(255,255,255,0.05)] rounded animate-pulse" />
                  <div className="h-3 w-3/4 bg-[rgba(255,255,255,0.04)] rounded animate-pulse" />
                  <div className="flex items-center gap-2 pt-1">
                    <div className="h-5 w-5 rounded-full bg-[rgba(255,255,255,0.06)] animate-pulse" />
                    <div className="h-3 w-16 bg-[rgba(255,255,255,0.04)] rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BoardSkeleton;
