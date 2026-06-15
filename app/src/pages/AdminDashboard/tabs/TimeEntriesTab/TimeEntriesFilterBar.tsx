import { X, Filter, Calendar } from 'lucide-react';
import CustomDateRangePicker from './CustomDateRangePicker';
import { DATE_PRESETS } from './types';
import type { DatePreset, EmployeeOption, FiltersState, ProjectOption } from './types';

interface TimeEntriesFilterBarProps {
  filters: FiltersState;
  setFilters: React.Dispatch<React.SetStateAction<FiltersState>>;
  sortedProjects: ProjectOption[];
  sortedEmployees: EmployeeOption[];
  hasAnyFilter: boolean;
  onReset: () => void;
}

/** Date-preset chips + custom range + project/employee dropdowns + reset. */
const TimeEntriesFilterBar: React.FC<TimeEntriesFilterBarProps> = ({
  filters,
  setFilters,
  sortedProjects,
  sortedEmployees,
  hasAnyFilter,
  onReset,
}) => {
  return (
    <div className="rounded-2xl border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] p-4 space-y-4">
      {/* Date preset chips */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-3.5 h-3.5 text-[#737373]" />
          <span className="text-xs font-medium text-[#737373]">Date range</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {DATE_PRESETS.map((p) => {
            const active = filters.preset === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setFilters((f) => ({ ...f, preset: p.id as DatePreset }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? 'bg-[#E0B954] text-black'
                    : 'bg-[rgba(255,255,255,0.04)] text-[#a3a3a3] hover:bg-[rgba(255,255,255,0.08)] hover:text-white'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {filters.preset === 'custom' && (
          <CustomDateRangePicker
            from={filters.customFrom}
            to={filters.customTo}
            onFromChange={(v) => setFilters((f) => ({ ...f, customFrom: v }))}
            onToChange={(v) => setFilters((f) => ({ ...f, customTo: v }))}
          />
        )}
      </div>

      {/* Project + Employee dropdowns + Reset */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <div>
          <label className="text-[11px] text-[#737373] block mb-1 flex items-center gap-1">
            <Filter className="w-3 h-3" />
            Project
          </label>
          <select
            value={filters.projectId ?? ''}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                projectId: e.target.value === '' ? null : Number(e.target.value),
              }))
            }
            className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[#F4F6FF] rounded-lg h-9 px-2 text-xs"
          >
            <option value="">All projects</option>
            {sortedProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-[#737373] block mb-1 flex items-center gap-1">
            <Filter className="w-3 h-3" />
            Employee
          </label>
          <select
            value={filters.developerId ?? ''}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                developerId: e.target.value === '' ? null : Number(e.target.value),
              }))
            }
            className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] text-[#F4F6FF] rounded-lg h-9 px-2 text-xs"
          >
            <option value="">All employees</option>
            {sortedEmployees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={onReset}
          disabled={!hasAnyFilter}
          className="h-9 px-3 rounded-lg text-xs font-medium text-[#a3a3a3] hover:text-white hover:bg-[rgba(255,255,255,0.04)] flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <X className="w-3 h-3" />
          Reset
        </button>
      </div>
    </div>
  );
};

export default TimeEntriesFilterBar;
