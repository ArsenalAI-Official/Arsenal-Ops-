import React, { useMemo, useState } from 'react';
import type { EmployeeResponse } from '@/client';
import EmployeeCapacityTable from './EmployeeCapacityTable';
import EmployeeFilterBar from './EmployeeFilterBar';
import TeamCapacityOverview from './TeamCapacityOverview';
import { WEEKLY_CAPACITY_HRS } from './types';
import type {
  DeveloperCapacity,
  EmployeeRow,
  EmployeeSortKey,
  EmployeeStatusFilter,
  TeamCapacity,
} from './types';

interface EmployeesTabProps {
  employees: EmployeeResponse[];
  developerCapacities: DeveloperCapacity[];
  teamCapacity: TeamCapacity;
  availableSpecs: string[];
  onEditEmployee: (employee: EmployeeResponse) => void;
  onDeleteEmployee: (id: number) => void;
  /** Gates the per-row Edit/Delete action buttons. Read-only admins see
   *  the capacity table without the actions column. */
  canWriteEmployees: boolean;
}

const EmployeesTab: React.FC<EmployeesTabProps> = ({
  employees,
  developerCapacities,
  teamCapacity,
  availableSpecs,
  onEditEmployee,
  onDeleteEmployee,
  canWriteEmployees,
}) => {
  const [expandedCapacityDevId, setExpandedCapacityDevId] = useState<number | null>(null);

  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState<EmployeeStatusFilter>('all');
  const [employeeSpecFilter, setEmployeeSpecFilter] = useState<string>('all');
  const [employeeSort, setEmployeeSort] = useState<{ key: EmployeeSortKey; dir: 'asc' | 'desc' }>({
    key: 'capacity',
    dir: 'desc',
  });

  const handleEmployeeSort = (key: EmployeeSortKey) => {
    setEmployeeSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' },
    );
  };

  const filteredEmployeeRows = useMemo<EmployeeRow[]>(() => {
    const q = employeeSearch.trim().toLowerCase();
    const rows = employees.map((emp) => {
      const cap = developerCapacities.find((d) => d.developer_id === emp.id);
      const used = cap?.this_week_capacity_used ?? 0;
      const inProgress = cap?.this_week_in_progress_hours ?? 0;
      const inReview = cap?.this_week_in_review_hours ?? 0;
      const done = cap?.this_week_done_hours ?? 0;
      const remaining = Math.max(0, WEEKLY_CAPACITY_HRS - used);
      const status: 'Available' | 'Moderate' | 'Busy' =
        remaining >= 10 ? 'Available' : remaining > 0 ? 'Moderate' : 'Busy';
      return { emp, used, inProgress, inReview, done, remaining, status };
    });

    const filtered = rows.filter((r) => {
      if (q && !(r.emp.name.toLowerCase().includes(q) || r.emp.email.toLowerCase().includes(q)))
        return false;
      if (employeeStatusFilter !== 'all' && r.status !== employeeStatusFilter) return false;
      if (employeeSpecFilter !== 'all' && (r.emp.specialization || '') !== employeeSpecFilter)
        return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      switch (employeeSort.key) {
        case 'name':
          av = a.emp.name.toLowerCase();
          bv = b.emp.name.toLowerCase();
          break;
        case 'projects':
          av = a.emp.project_count;
          bv = b.emp.project_count;
          break;
        case 'assigned':
          av = a.emp.assigned_items_count;
          bv = b.emp.assigned_items_count;
          break;
        case 'capacity':
        default:
          av = a.used;
          bv = b.used;
          break;
      }
      if (av < bv) return employeeSort.dir === 'asc' ? -1 : 1;
      if (av > bv) return employeeSort.dir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [
    employees,
    developerCapacities,
    employeeSearch,
    employeeStatusFilter,
    employeeSpecFilter,
    employeeSort,
  ]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-white">Team Members</h2>
      </div>

      {employees.length > 0 && (
        <TeamCapacityOverview
          teamCapacity={teamCapacity}
          employeeStatusFilter={employeeStatusFilter}
          onStatusFilterChange={setEmployeeStatusFilter}
        />
      )}

      <EmployeeFilterBar
        employeeSearch={employeeSearch}
        onSearchChange={setEmployeeSearch}
        employeeStatusFilter={employeeStatusFilter}
        onStatusFilterChange={setEmployeeStatusFilter}
        employeeSpecFilter={employeeSpecFilter}
        onSpecFilterChange={setEmployeeSpecFilter}
        availableSpecs={availableSpecs}
        onClearFilters={() => {
          setEmployeeSearch('');
          setEmployeeStatusFilter('all');
          setEmployeeSpecFilter('all');
        }}
        filteredCount={filteredEmployeeRows.length}
        totalCount={employees.length}
      />

      <EmployeeCapacityTable
        rows={filteredEmployeeRows}
        developerCapacities={developerCapacities}
        employeeSort={employeeSort}
        onSort={handleEmployeeSort}
        expandedCapacityDevId={expandedCapacityDevId}
        onToggleExpand={(id) => setExpandedCapacityDevId((prev) => (prev === id ? null : id))}
        onEditEmployee={onEditEmployee}
        onDeleteEmployee={onDeleteEmployee}
        canWriteEmployees={canWriteEmployees}
        totalEmployees={employees.length}
      />
    </div>
  );
};

export type { DeveloperCapacity, CapacityTicket, TeamCapacity } from './types';
export default EmployeesTab;
