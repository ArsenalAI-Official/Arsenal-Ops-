import { LayoutGrid, TableProperties } from 'lucide-react';
import type { ProjectsView } from './types';

interface ProjectsViewToggleProps {
  view: ProjectsView;
  onViewChange: (view: ProjectsView) => void;
}

/** Cards | Reports sub-view pill toggle. Mirrors the Capacity / Logged-hours
 *  pill toggle pattern used inside an expanded row in EmployeesTab — same
 *  active/inactive styling, same shape. */
const ProjectsViewToggle: React.FC<ProjectsViewToggleProps> = ({ view, onViewChange }) => {
  return (
    <div className="flex items-center gap-2">
      {[
        { id: 'cards' as const, label: 'Cards', icon: LayoutGrid },
        { id: 'reports' as const, label: 'Reports', icon: TableProperties },
      ].map((opt) => {
        const active = view === opt.id;
        const Icon = opt.icon;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onViewChange(opt.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              active
                ? 'bg-[#E0B954]/20 text-[#E0B954] border border-[#E0B954]/40'
                : 'bg-[rgba(255,255,255,0.03)] text-[#a3a3a3] border border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.06)]'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};

export default ProjectsViewToggle;
