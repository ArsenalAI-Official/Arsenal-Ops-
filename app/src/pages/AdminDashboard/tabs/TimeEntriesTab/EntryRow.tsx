import { Building2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { GroupChildRow } from './types';

/**
 * One line in a row's expanded breakdown: an icon chip, the child dimension's
 * label (+ optional client sublabel in the employee view), and an hours pill.
 * `icon` reflects the child dimension; `showSecondary` must match the header.
 */
const EntryRow: React.FC<{ row: GroupChildRow; icon: LucideIcon; showSecondary: boolean }> = ({
  row,
  icon: Icon,
  showSecondary,
}) => (
  <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-[rgba(255,255,255,0.03)] transition-colors">
    <div className="w-8 h-8 rounded-lg bg-[#E0B954]/10 flex items-center justify-center shrink-0">
      <Icon className="w-4 h-4 text-[#E0B954]" />
    </div>
    <div className="min-w-0 flex-1">
      <div className="text-[#e5e5e5] text-sm font-medium truncate">
        {row.label || <span className="text-[#737373] italic">—</span>}
      </div>
      {showSecondary && row.sublabel && (
        <div className="text-xs text-[#737373] truncate flex items-center gap-1 mt-0.5">
          <Building2 className="w-3 h-3 shrink-0" />
          {row.sublabel}
        </div>
      )}
    </div>
    <div className="shrink-0 rounded-md bg-[#E0B954]/10 px-2.5 py-1 text-sm font-semibold tabular-nums text-[#E0B954]">
      {row.hours}h
    </div>
  </div>
);

export default EntryRow;
