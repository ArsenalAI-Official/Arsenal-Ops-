import { Activity } from 'lucide-react';
import { WEEKLY_CAPACITY } from '../types';

interface CapacityTileProps {
  isLoading: boolean;
  hasData: boolean;
  statusColor: string;
  used: number;
  totalLoggedThisWeek: number;
  onClick: () => void;
}

const CapacityTile = ({
  isLoading,
  hasData,
  statusColor,
  used,
  totalLoggedThisWeek,
  onClick,
}: CapacityTileProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading || !hasData}
      className="flex-1 text-left bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-2xl px-6 py-5 flex flex-col justify-between cursor-pointer hover:border-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.04)] transition-colors disabled:cursor-default disabled:hover:border-[rgba(255,255,255,0.05)] disabled:hover:bg-[rgba(255,255,255,0.025)]"
    >
      <div className="mb-3">
        <Activity className="w-4 h-4" style={{ color: statusColor }} />
      </div>
      {isLoading ? (
        <div className="h-8 w-16 bg-[rgba(255,255,255,0.06)] rounded-lg animate-pulse mb-1" />
      ) : (
        <>
          <div className="text-3xl font-bold tracking-tight" style={{ color: statusColor }}>
            {used}h
            <span className="text-base text-[#737373] font-normal"> / {WEEKLY_CAPACITY}h</span>
          </div>
          <div className="text-[11px] text-[#E0B954] font-medium mt-0.5">
            {totalLoggedThisWeek}h logged this week
          </div>
        </>
      )}
      <div className="text-xs text-[#737373] font-medium mt-1">Capacity this week</div>
    </button>
  );
};

export default CapacityTile;
