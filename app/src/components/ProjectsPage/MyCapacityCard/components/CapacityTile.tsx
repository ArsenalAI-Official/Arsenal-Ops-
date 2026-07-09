import { Gauge } from 'lucide-react';
import { WEEKLY_CAPACITY } from '../types';

interface CapacityTileProps {
  isLoading: boolean;
  hasData: boolean;
  statusColor: string;
  used: number;
  onClick: () => void;
}

const CapacityTile = ({ isLoading, hasData, statusColor, used, onClick }: CapacityTileProps) => {
  const pct = Math.min(100, Math.round((used / WEEKLY_CAPACITY) * 100));
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading || !hasData}
      className="flex items-center gap-3.5 px-5 py-4 rounded-2xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] text-left hover:border-[rgba(255,255,255,0.16)] hover:bg-[rgba(255,255,255,0.035)] transition-colors disabled:cursor-default disabled:hover:border-[rgba(255,255,255,0.07)] disabled:hover:bg-[rgba(255,255,255,0.02)]"
    >
      <span
        className="w-[42px] h-[42px] rounded-[11px] flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--text-mid)' }}
      >
        <Gauge className="w-[18px] h-[18px]" />
      </span>
      <span className="flex flex-col flex-1 min-w-0">
        {isLoading ? (
          <span className="h-7 w-16 bg-[rgba(255,255,255,0.06)] rounded-lg animate-pulse" />
        ) : (
          <span className="flex items-baseline gap-1.5 leading-none">
            <span
              className="text-[28px] font-bold tracking-[-0.02em]"
              style={{ color: statusColor }}
            >
              {used}
            </span>
            <span className="text-[13px] text-[#737373] font-semibold">/ {WEEKLY_CAPACITY}h</span>
          </span>
        )}
        <span className="flex items-center gap-2 mt-2">
          <span className="flex-1 h-1.5 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
            <span
              className="block h-full rounded-full"
              style={{ width: `${pct}%`, backgroundColor: statusColor }}
            />
          </span>
          <span className="text-[11px] text-muted-foreground flex-shrink-0">Capacity</span>
        </span>
      </span>
    </button>
  );
};

export default CapacityTile;
