import React from 'react';
import { CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { getStatusIcon } from '../components/StatusIcon';
import { getPriorityColor } from '../lib/listLogic';
import type { SortDirection, SortField, WorkItem } from '../types';

interface ListTableProps {
  groupedItems: Record<string, WorkItem[]>;
  groupBy: string;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  totalItems: number;
  onSelectItem: (item: WorkItem) => void;
}

// Hoisted to module scope so it isn't a fresh component type on every ListTable
// render (which would remount every header <th> subtree instead of reconciling).
interface SortHeaderProps {
  field: SortField;
  label: string;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
}

const SortHeader: React.FC<SortHeaderProps> = ({
  field,
  label,
  sortField,
  sortDirection,
  onSort,
}) => (
  <th
    className="text-left py-3 px-4 text-xs font-medium text-[#737373] uppercase cursor-pointer hover:text-white transition-colors"
    onClick={() => onSort(field)}
  >
    <div className="flex items-center gap-1">
      {label}
      {sortField === field &&
        (sortDirection === 'asc' ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        ))}
    </div>
  </th>
);

const ListTable: React.FC<ListTableProps> = ({
  groupedItems,
  groupBy,
  sortField,
  sortDirection,
  onSort,
  totalItems,
  onSelectItem,
}) => {
  return (
    <CardContent>
      {Object.entries(groupedItems).map(([group, items]) => (
        <div key={group} className="mb-6 last:mb-0">
          {groupBy !== 'none' && (
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="border-[rgba(255,255,255,0.08)] text-[#C79E3B]">
                {group}
              </Badge>
              <span className="text-[#737373] text-sm">{items.length} items</span>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-[rgba(255,255,255,0.05)]">
            <table className="w-full">
              <thead className="bg-[#0A0A14]">
                <tr>
                  <th className="w-10"></th>
                  <SortHeader
                    field="title"
                    label="Task"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={onSort}
                  />
                  <SortHeader
                    field="status"
                    label="Status"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={onSort}
                  />
                  <SortHeader
                    field="priority"
                    label="Priority"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={onSort}
                  />
                  <SortHeader
                    field="assignee"
                    label="Assignee"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={onSort}
                  />
                  <SortHeader
                    field="due_date"
                    label="Due Date"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={onSort}
                  />
                  <SortHeader
                    field="completed_at"
                    label="Completed"
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={onSort}
                  />
                  <th className="text-left py-3 px-4 text-xs font-medium text-[#737373] uppercase">
                    Est / Logged
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] cursor-pointer transition-colors"
                    onClick={() => onSelectItem(item)}
                  >
                    <td className="py-3 px-4">{getStatusIcon(item.status)}</td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col">
                        {item.parent_key && (
                          <span className="text-[#555] text-xs mb-0.5">
                            &#9668; {item.parent_key}
                          </span>
                        )}
                        <span className="text-white font-medium">{item.key}</span>
                        <span className="text-[#737373] text-sm truncate max-w-[300px]">
                          {item.title}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge
                        variant="outline"
                        className="border-[rgba(255,255,255,0.08)] text-[#a3a3a3]"
                      >
                        {item.status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="outline" className={getPriorityColor(item.priority)}>
                        {item.priority}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-[#a3a3a3]">{item.assignee || 'Unassigned'}</td>
                    <td className="py-3 px-4 text-[#a3a3a3]">
                      {item.due_date ? new Date(item.due_date).toLocaleDateString() : '-'}
                    </td>
                    <td className="py-3 px-4 text-[#a3a3a3]">
                      {item.completed_at ? new Date(item.completed_at).toLocaleDateString() : '-'}
                    </td>
                    <td className="py-3 px-4 text-[#a3a3a3]">
                      {item.estimated_hours || 0}h / {item.logged_hours || 0}h
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {totalItems === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle className="text-[#737373]">No tasks match your filters</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
    </CardContent>
  );
};

export default ListTable;
