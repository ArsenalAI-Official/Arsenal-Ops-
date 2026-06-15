import React, { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { filterAndSortItems, groupItems } from './lib/listLogic';
import type { ListViewProps, SortDirection, SortField, WorkItem } from './types';
import ListFilters from './sections/ListFilters';
import ListTable from './sections/ListTable';
import TicketDetailPanel from './sections/TicketDetailPanel';

const ListView: React.FC<ListViewProps> = ({ workItems, onTaskClick }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('status');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [groupBy, setGroupBy] = useState<string>('none');
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);

  const uniqueAssignees = useMemo(
    () => [...new Set(workItems.map((i) => i.assignee || 'Unassigned'))],
    [workItems],
  );

  const filteredAndSortedItems = useMemo(
    () =>
      filterAndSortItems(
        workItems,
        searchTerm,
        statusFilter,
        priorityFilter,
        assigneeFilter,
        sortField,
        sortDirection,
      ),
    [workItems, searchTerm, statusFilter, priorityFilter, assigneeFilter, sortField, sortDirection],
  );

  const groupedItems = useMemo(
    () => groupItems(filteredAndSortedItems, groupBy),
    [filteredAndSortedItems, groupBy],
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleSelectItem = (item: WorkItem) => {
    setSelectedItem(item);
    onTaskClick?.(item);
  };

  return (
    <Card className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
      <ListFilters
        itemCount={filteredAndSortedItems.length}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        priorityFilter={priorityFilter}
        setPriorityFilter={setPriorityFilter}
        assigneeFilter={assigneeFilter}
        setAssigneeFilter={setAssigneeFilter}
        groupBy={groupBy}
        setGroupBy={setGroupBy}
        uniqueAssignees={uniqueAssignees}
      />

      <ListTable
        groupedItems={groupedItems}
        groupBy={groupBy}
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
        totalItems={filteredAndSortedItems.length}
        onSelectItem={handleSelectItem}
      />

      {/* Ticket Detail Slide-in Panel */}
      {selectedItem && (
        <TicketDetailPanel
          selectedItem={selectedItem}
          workItems={workItems}
          onClose={() => setSelectedItem(null)}
          onSelectItem={setSelectedItem}
        />
      )}
    </Card>
  );
};

export default ListView;
