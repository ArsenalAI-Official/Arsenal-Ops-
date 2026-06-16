import React from 'react';
import { Pencil, Trash2, ChevronDown, ChevronUp, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import EmployeeExpandedRow, { type ProjectGroup } from './EmployeeExpandedRow';
import { projectColor } from './types';
import type { EmployeeResponse } from '@/client';
import type { DeveloperCapacity, EmployeeRow, EmployeeSort, EmployeeSortKey } from './types';

interface EmployeeCapacityTableProps {
  /** Pre-filtered + sorted rows from the orchestrator. */
  rows: EmployeeRow[];
  developerCapacities: DeveloperCapacity[];
  employeeSort: EmployeeSort;
  onSort: (key: EmployeeSortKey) => void;
  expandedCapacityDevId: number | null;
  onToggleExpand: (id: number) => void;
  onEditEmployee: (employee: EmployeeResponse) => void;
  onDeleteEmployee: (id: number) => void;
  canWriteEmployees: boolean;
  /** Total employee count (before filters) — drives the empty-state copy. */
  totalEmployees: number;
}

/** The capacity table: sortable header + one expandable row per employee. */
const EmployeeCapacityTable: React.FC<EmployeeCapacityTableProps> = ({
  rows,
  developerCapacities,
  employeeSort,
  onSort,
  expandedCapacityDevId,
  onToggleExpand,
  onEditEmployee,
  onDeleteEmployee,
  canWriteEmployees,
  totalEmployees,
}) => {
  return (
    <div className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.05)] rounded-xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[rgba(255,255,255,0.05)]">
            {(
              [
                { key: 'name' as const, label: 'Name', sortable: true, align: 'left' },
                { key: null, label: 'Email', sortable: false, align: 'left' },
                { key: null, label: 'GitHub', sortable: false, align: 'left' },
                {
                  key: 'projects' as const,
                  label: 'Projects',
                  sortable: true,
                  align: 'left',
                },
                {
                  key: 'assigned' as const,
                  label: 'Assigned',
                  sortable: true,
                  align: 'left',
                },
                {
                  key: 'capacity' as const,
                  label: 'Capacity',
                  sortable: true,
                  align: 'left',
                },
                { key: null, label: 'Actions', sortable: false, align: 'right' },
              ] as const
            ).map((col, i) => {
              const isActive = col.sortable && col.key && employeeSort.key === col.key;
              const ArrowIcon = isActive
                ? employeeSort.dir === 'asc'
                  ? ChevronUp
                  : ChevronDown
                : ArrowUpDown;
              const baseCls = `text-xs font-medium text-[#737373] uppercase tracking-wider px-5 py-3 ${col.align === 'right' ? 'text-right' : 'text-left'}`;
              if (!col.sortable || !col.key) {
                return (
                  <th key={i} className={baseCls}>
                    {col.label}
                  </th>
                );
              }
              return (
                <th key={i} className={baseCls}>
                  <button
                    onClick={() => onSort(col.key as EmployeeSortKey)}
                    className={`inline-flex items-center gap-1 hover:text-white transition-colors ${isActive ? 'text-white' : ''}`}
                    title={`Sort by ${col.label}`}
                  >
                    {col.label}
                    <ArrowIcon className={`w-3 h-3 ${isActive ? 'opacity-100' : 'opacity-40'}`} />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ emp }) => {
            const devCapacity = developerCapacities.find((d) => d.developer_id === emp.id);
            const capacityUsed = devCapacity?.this_week_capacity_used ?? 0;
            const capacityPercentage = Math.round((capacityUsed / 40) * 100);
            const remaining = devCapacity?.this_week_remaining_capacity ?? 40;
            const capacityStatus =
              remaining >= 10 ? 'Available' : remaining > 0 ? 'Moderate' : 'Busy';
            const isExpanded = expandedCapacityDevId === emp.id;
            const tickets = devCapacity?.tickets ?? [];

            // Group tickets by project for inline distribution + expanded view
            const projectGroupsMap = tickets.reduce<Record<number, ProjectGroup>>((acc, t) => {
              const pid = t.project_id;
              if (!acc[pid])
                acc[pid] = {
                  projectId: pid,
                  projectName: t.project_name || `Project ${pid}`,
                  tickets: [],
                  total: 0,
                  logged: 0,
                };
              acc[pid].tickets.push(t);
              acc[pid].total += t.counted_hours;
              acc[pid].logged += t.your_logged_this_week ?? 0;
              return acc;
            }, {});
            const projectsByHours = Object.values(projectGroupsMap).sort(
              (a, b) => b.total - a.total,
            );

            return (
              <React.Fragment key={emp.id}>
                <tr
                  onClick={() => {
                    onToggleExpand(emp.id);
                  }}
                  title="Click row to see breakdown"
                  className={`border-b border-[rgba(255,255,255,0.03)] cursor-pointer hover:bg-[rgba(255,255,255,0.02)] ${isExpanded ? 'bg-[rgba(255,255,255,0.015)]' : ''}`}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[rgba(224,185,84,0.2)] flex items-center justify-center text-sm font-medium text-[#E0B954]">
                        {emp.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">{emp.name}</div>
                        {emp.specialization && (
                          <div className="text-xs text-[#737373] capitalize">
                            {emp.specialization}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-[#a3a3a3]">{emp.email}</td>
                  <td className="px-5 py-4 text-sm text-[#737373]">{emp.github_username || '-'}</td>
                  <td className="px-5 py-4 text-sm text-[#a3a3a3]">{emp.project_count}</td>
                  <td className="px-5 py-4 text-sm text-[#a3a3a3]">{emp.assigned_items_count}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0 max-w-xs">
                        <div className="h-2 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden flex">
                          {projectsByHours.map((p) => (
                            <div
                              key={p.projectId}
                              className="h-full"
                              style={{
                                width: `${Math.min(100, (p.total / 40) * 100)}%`,
                                backgroundColor: projectColor(p.projectId),
                              }}
                              title={`${p.projectName}: ${p.total}h (${p.tickets.length} ticket${p.tickets.length === 1 ? '' : 's'})`}
                            />
                          ))}
                        </div>
                        <div className="text-[10px] text-[#737373] mt-1.5 flex items-center gap-2 flex-wrap">
                          {projectsByHours.length === 0 ? (
                            <span>No tickets this week</span>
                          ) : (
                            <>
                              {projectsByHours.slice(0, 3).map((p, i) => (
                                <React.Fragment key={p.projectId}>
                                  {i > 0 && (
                                    <span className="text-[rgba(255,255,255,0.15)]">·</span>
                                  )}
                                  <span className="flex items-center gap-1">
                                    <span
                                      className="w-1.5 h-1.5 rounded-sm"
                                      style={{
                                        backgroundColor: projectColor(p.projectId),
                                      }}
                                    />
                                    <span className="truncate max-w-[120px]" title={p.projectName}>
                                      {p.projectName}
                                    </span>
                                    <span>· {p.total}h</span>
                                  </span>
                                </React.Fragment>
                              ))}
                              {projectsByHours.length > 3 && (
                                <>
                                  <span className="text-[rgba(255,255,255,0.15)]">·</span>
                                  <span>+{projectsByHours.length - 3} more</span>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      <span
                        className={`text-xs font-medium whitespace-nowrap ${
                          capacityStatus === 'Available'
                            ? 'text-[#E0B954]'
                            : capacityStatus === 'Busy'
                              ? 'text-[#F59E0B]'
                              : 'text-[#a3a3a3]'
                        }`}
                      >
                        {capacityStatus} · {capacityUsed}h/40h ({capacityPercentage}%)
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-2">
                      {/* Buttons stay visible so the action column has
                          consistent width across rows. `disabled` gates the
                          click + greys out the icon; backend independently
                          enforces `admin.employees_write`. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditEmployee(emp);
                        }}
                        disabled={!canWriteEmployees}
                        className="text-[#737373] hover:text-white h-8 w-8 p-0 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-[#737373]"
                        title={
                          canWriteEmployees ? 'Edit employee' : 'Requires employees-write access'
                        }
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteEmployee(emp.id);
                        }}
                        disabled={!canWriteEmployees}
                        className="text-red-400 hover:text-red-300 h-8 w-8 p-0 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-red-400"
                        title={
                          canWriteEmployees ? 'Delete employee' : 'Requires employees-write access'
                        }
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="border-b border-[rgba(255,255,255,0.03)] bg-[rgba(0,0,0,0.25)]">
                    <td colSpan={7} className="px-5 py-5">
                      <EmployeeExpandedRow
                        devCapacity={devCapacity}
                        tickets={tickets}
                        projectsByHours={projectsByHours}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      {totalEmployees === 0 && (
        <Empty>
          <EmptyDescription>No employees yet.</EmptyDescription>
        </Empty>
      )}
      {totalEmployees > 0 && rows.length === 0 && (
        <Empty>
          <EmptyDescription>No employees match the current filters.</EmptyDescription>
        </Empty>
      )}
    </div>
  );
};

export default EmployeeCapacityTable;
