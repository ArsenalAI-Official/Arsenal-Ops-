import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { EmployeeStatusFilter } from './types';

interface EmployeeFilterBarProps {
  employeeSearch: string;
  onSearchChange: (value: string) => void;
  employeeStatusFilter: EmployeeStatusFilter;
  onStatusFilterChange: (value: EmployeeStatusFilter) => void;
  employeeSpecFilter: string;
  onSpecFilterChange: (value: string) => void;
  availableSpecs: string[];
  onClearFilters: () => void;
  /** Filtered row count (numerator) shown against the total employee count. */
  filteredCount: number;
  totalCount: number;
}

/** Search input + specialization/status dropdowns + clear-filters + count. */
const EmployeeFilterBar: React.FC<EmployeeFilterBarProps> = ({
  employeeSearch,
  onSearchChange,
  employeeStatusFilter,
  onStatusFilterChange,
  employeeSpecFilter,
  onSpecFilterChange,
  availableSpecs,
  onClearFilters,
  filteredCount,
  totalCount,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[220px]">
        <Search className="w-3.5 h-3.5 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <Input
          value={employeeSearch}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by name or email..."
          className="bg-[rgba(255,255,255,0.025)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-xl h-9 pl-8 text-sm"
        />
      </div>
      {availableSpecs.length > 0 && (
        <select
          value={employeeSpecFilter}
          onChange={(e) => onSpecFilterChange(e.target.value)}
          className="h-9 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
          title="Filter by specialization"
        >
          <option value="all">All specializations</option>
          {availableSpecs.map((s) => (
            <option key={s} value={s} className="capitalize">
              {s}
            </option>
          ))}
        </select>
      )}
      <select
        value={employeeStatusFilter}
        onChange={(e) => onStatusFilterChange(e.target.value as EmployeeStatusFilter)}
        className="h-9 bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.07)] text-[#f5f5f5] rounded-xl px-3 text-sm"
        title="Filter by capacity status"
      >
        <option value="all">All statuses</option>
        <option value="Available">Available</option>
        <option value="Moderate">Moderate</option>
        <option value="Busy">Busy</option>
      </select>
      {(employeeSearch || employeeStatusFilter !== 'all' || employeeSpecFilter !== 'all') && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className="h-9 text-xs text-[#737373] hover:text-white rounded-xl px-3"
        >
          Clear filters
        </Button>
      )}
      <div className="ml-auto text-xs text-[#737373]">
        {filteredCount} of {totalCount}
      </div>
    </div>
  );
};

export default EmployeeFilterBar;
