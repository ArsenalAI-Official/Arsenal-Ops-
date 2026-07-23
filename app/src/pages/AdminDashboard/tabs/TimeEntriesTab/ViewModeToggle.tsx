import { Users, FolderKanban } from 'lucide-react';
import { VIEW_MODES } from './types';
import type { ViewMode } from './types';

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const ICONS: Record<ViewMode, React.ComponentType<{ className?: string }>> = {
  employee: Users,
  project: FolderKanban,
};

/** Segmented control that switches how time entries are grouped. */
const ViewModeToggle: React.FC<ViewModeToggleProps> = ({ value, onChange }) => {
  return (
    <div
      role="tablist"
      aria-label="Group time entries by"
      className="inline-flex items-center gap-1 rounded-xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] p-1"
    >
      {VIEW_MODES.map((m) => {
        const active = value === m.id;
        const Icon = ICONS[m.id];
        return (
          <button
            key={m.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(m.id)}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
              active
                ? 'bg-[#E0B954] text-black shadow-sm'
                : 'text-[#a3a3a3] hover:bg-[rgba(255,255,255,0.05)] hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {m.label}
          </button>
        );
      })}
    </div>
  );
};

export default ViewModeToggle;
