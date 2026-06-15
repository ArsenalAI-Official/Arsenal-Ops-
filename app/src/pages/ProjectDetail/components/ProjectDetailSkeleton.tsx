/**
 * Full-page loading skeleton shown while the project query resolves.
 * Pure presentation — no props, no state. Extracted verbatim from
 * ProjectDetail.tsx's `isLoading` early return.
 */
const ProjectDetailSkeleton = () => {
  return (
    <div className="min-h-screen bg-[#080808] text-[#F4F6FF]">
      {/* Skeleton Header */}
      <header className="border-b border-[rgba(255,255,255,0.05)] bg-[#080808]/95 sticky top-0 z-40">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-8 w-24 bg-[rgba(255,255,255,0.06)] rounded-lg animate-pulse" />
            <div className="w-px h-6 bg-[rgba(255,255,255,0.07)]" />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[rgba(255,255,255,0.06)] animate-pulse" />
              <div className="space-y-1.5">
                <div className="h-4 w-36 bg-[rgba(255,255,255,0.06)] rounded animate-pulse" />
                <div className="h-3 w-16 bg-[rgba(255,255,255,0.04)] rounded animate-pulse" />
              </div>
            </div>
          </div>
          <div className="h-9 w-28 bg-[rgba(255,255,255,0.06)] rounded-xl animate-pulse" />
        </div>
        {/* Skeleton Tabs */}
        <div className="px-6 flex gap-1 border-t border-[rgba(255,255,255,0.03)]">
          {[...Array(7)].map((_, i) => (
            <div
              key={i}
              className="h-10 w-24 bg-[rgba(255,255,255,0.04)] rounded-t-lg animate-pulse mx-1"
            />
          ))}
        </div>
      </header>
      {/* Skeleton Content */}
      <main className="px-6 py-4 max-w-7xl mx-auto space-y-4">
        {/* Stat cards row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5"
            >
              <div className="h-3 w-16 bg-[rgba(255,255,255,0.06)] rounded animate-pulse mb-3" />
              <div className="h-8 w-12 bg-[rgba(255,255,255,0.07)] rounded animate-pulse mb-1" />
              <div className="h-1.5 w-full bg-[rgba(255,255,255,0.04)] rounded-full animate-pulse" />
            </div>
          ))}
        </div>
        {/* Content block */}
        <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5 space-y-4">
          <div className="h-5 w-40 bg-[rgba(255,255,255,0.06)] rounded animate-pulse" />
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-3 rounded animate-pulse"
                style={{ width: `${90 - i * 8}%`, backgroundColor: 'rgba(255,255,255,0.04)' }}
              />
            ))}
          </div>
        </div>
        {/* Second content block */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => (
            <div
              key={i}
              className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5 space-y-3"
            >
              <div className="h-4 w-32 bg-[rgba(255,255,255,0.06)] rounded animate-pulse" />
              {[...Array(4)].map((_, j) => (
                <div key={j} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[rgba(255,255,255,0.06)] animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 w-3/4 bg-[rgba(255,255,255,0.05)] rounded animate-pulse" />
                    <div className="h-2.5 w-1/2 bg-[rgba(255,255,255,0.04)] rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default ProjectDetailSkeleton;
