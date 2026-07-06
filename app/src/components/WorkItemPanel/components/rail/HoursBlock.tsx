import { Gauge, Lock } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

// The Hours block in the Properties rail — read-only.
//
// Allocated (estimated_hours) is editable, but only through the Edit form — not
// inline — so a committed field isn't changed by a stray click. Logged is
// server-derived from time-entry rows (changed only via the Log-hours action),
// and Remaining is derived (Allocated − Logged) and locked. So the whole block
// is display-only here; the progress bar shows logged/allocated.
interface HoursBlockProps {
  allocated: number;
  logged: number;
  remaining: number;
}

export const HoursBlock = ({ allocated, logged, remaining }: HoursBlockProps) => {
  const pct = allocated > 0 ? Math.min(100, Math.round((logged / allocated) * 100)) : 0;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-[#8A8A8A] uppercase">
        <Gauge className="h-3 w-3" />
        Hours
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-[#a3a3a3]">Allocated</span>
        <span className="text-sm font-semibold text-white tabular-nums">{allocated}h</span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-[#a3a3a3]">Logged</span>
        <span className="text-sm font-semibold text-white tabular-nums">{logged}h</span>
      </div>

      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-sm text-[#a3a3a3]">
          Remaining
          <Lock className="h-3 w-3 text-[#555]" />
        </span>
        <span className="text-sm font-semibold text-[#E0B954] tabular-nums">{remaining}h</span>
      </div>

      <Progress
        value={pct}
        className="h-1.5 bg-[rgba(255,255,255,0.07)] [&>[data-slot=progress-indicator]]:bg-[#E0B954]"
      />
      <p className="text-[11px] leading-relaxed text-[#555]">
        Allocated is set via Edit · Remaining = Allocated − Logged.
      </p>
    </div>
  );
};
