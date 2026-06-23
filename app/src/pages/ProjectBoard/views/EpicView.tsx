import { Target, ChevronDown, ChevronRight } from 'lucide-react';
import { Empty, EmptyTitle } from '@/components/ui/empty';
import type { EpicGroup } from '@/lib/hierarchy/buildEpicGroups';
import type { WorkItem } from '@/types/workItems';
import type { ListSortKey } from '../lib/listSort';
import ListSortHeader from './components/ListSortHeader';
import WorkItemRow, {
  type WorkItemRowTypeConfig,
  type WorkItemRowPriorityStyle,
} from './components/WorkItemRow';

export interface EpicViewProps {
  /** Epic-grouped rows (from useListGrouping's buildEpicGroups memo). */
  listViewEpicGroups: EpicGroup<WorkItem>[];
  /** Per-group collapse set + toggle (shared across list/epic). */
  collapsedSprints: Set<string>;
  toggleSprintCollapse: (key: string) => void;
  // ── Sort bag (from useListSort) ─────────────────────────────────────────
  listSortKey: ListSortKey | null;
  listSortDir: 'asc' | 'desc';
  handleListSort: (key: ListSortKey) => void;
  listItemComparator: ((a: WorkItem, b: WorkItem) => number) | null;
  // ── Type/priority config maps (still owned by the orchestrator) ─────────
  typeConfig: Record<string, WorkItemRowTypeConfig>;
  priorityColors: Record<string, WorkItemRowPriorityStyle>;
  // ── Row callbacks ───────────────────────────────────────────────────────
  onStatusChange: (item: WorkItem, newStatus: string) => void;
  onPrefetchComments: (itemId: string) => void;
  onOpenItem: (itemId: string) => void;
  /** Navigate to (open) an epic header's underlying epic item. */
  onOpenEpic: (epicId: string) => void;
}

/**
 * Epic view body — extracted verbatim from ProjectBoard's `viewMode === 'epic'`
 * block. Renders one collapsible card per epic group; each non-collapsed group
 * shows the shared ListSortHeader row + the shared 8-column WorkItemRow per item.
 * Pure props-down: no query/mutation here.
 *
 * Sort behavior preserved exactly: when a comparator is active, rows render flat
 * at depth 0 (cross-hierarchy ordering breaks parent/child grouping); otherwise
 * the hierarchy-aware rows (with their depth) render in natural order. The epic
 * view's StatusDotMenu was historically ungated, so `canWriteTracker` is passed
 * as `true` here to keep that behavior, and due/completed cells stay uncolored.
 */
const EpicView = ({
  listViewEpicGroups,
  collapsedSprints,
  toggleSprintCollapse,
  listSortKey,
  listSortDir,
  handleListSort,
  listItemComparator,
  typeConfig,
  priorityColors,
  onStatusChange,
  onPrefetchComments,
  onOpenItem,
  onOpenEpic,
}: EpicViewProps) => {
  return (
    <div role="tabpanel" id="tabpanel-epic" aria-labelledby="tab-epic" className="p-6 space-y-3">
      {listViewEpicGroups.length === 0 ? (
        <Empty className="py-16">
          <EmptyTitle className="text-[#737373] text-sm font-normal">No items found</EmptyTitle>
        </Empty>
      ) : (
        listViewEpicGroups.map((group) => {
          const isCollapsed = collapsedSprints.has(group.key);
          const isUnparented = group.key === 'unparented';
          const epicKey = group.epic?.key as string | undefined;
          return (
            <div
              key={group.key}
              className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl overflow-hidden"
            >
              {/* Epic group header */}
              <div className="flex items-center gap-2.5 px-5 py-3.5 hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                <button
                  onClick={() => toggleSprintCollapse(group.key)}
                  className="flex items-center gap-2.5 flex-1 text-left min-w-0"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5 text-[#737373] shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-[#737373] shrink-0" />
                  )}
                  {isUnparented ? (
                    <span className="text-sm font-semibold text-[#737373] italic">No epic</span>
                  ) : (
                    <>
                      <Target className="w-3.5 h-3.5 text-[#A78BFA] shrink-0" />
                      {epicKey && (
                        <span className="text-[11px] font-mono text-[#A78BFA] shrink-0">
                          {epicKey}
                        </span>
                      )}
                      <span className="text-sm font-semibold text-[#f5f5f5] truncate">
                        {group.label}
                      </span>
                    </>
                  )}
                  <span className="text-xs text-[#737373] shrink-0">
                    {group.count} item{group.count !== 1 ? 's' : ''}
                  </span>
                </button>
                {!isUnparented && group.epic && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenEpic(group.epic!.id);
                    }}
                    className="text-[10px] text-[#737373] hover:text-[#A78BFA] transition-colors shrink-0"
                    title="Open epic"
                  >
                    Open epic →
                  </button>
                )}
              </div>

              {!isCollapsed && (
                <>
                  {/* Table header */}
                  <div className="grid grid-cols-[120px_1fr_120px_100px_80px_120px_110px_110px] gap-4 px-5 py-3 border-t border-[rgba(255,255,255,0.05)] text-xs text-[#737373] font-semibold uppercase tracking-wider">
                    <ListSortHeader
                      label="Type"
                      sortKey="type"
                      activeKey={listSortKey}
                      sortDir={listSortDir}
                      onSort={handleListSort}
                    />
                    <span>Title</span>
                    <ListSortHeader
                      label="Status"
                      sortKey="status"
                      activeKey={listSortKey}
                      sortDir={listSortDir}
                      onSort={handleListSort}
                    />
                    <ListSortHeader
                      label="Priority"
                      sortKey="priority"
                      activeKey={listSortKey}
                      sortDir={listSortDir}
                      onSort={handleListSort}
                    />
                    <span>Points</span>
                    <ListSortHeader
                      label="Assignee"
                      sortKey="assignee"
                      activeKey={listSortKey}
                      sortDir={listSortDir}
                      onSort={handleListSort}
                    />
                    <ListSortHeader
                      label="Due Date"
                      sortKey="due_date"
                      activeKey={listSortKey}
                      sortDir={listSortDir}
                      onSort={handleListSort}
                    />
                    <ListSortHeader
                      label="Completed"
                      sortKey="completed_at"
                      activeKey={listSortKey}
                      sortDir={listSortDir}
                      onSort={handleListSort}
                    />
                  </div>
                  {/* Table rows. Default: hierarchy-aware (parent → child with
                      indent). When sorted, render flat at depth=0 since
                      cross-hierarchy ordering breaks the parent/child grouping. */}
                  {(listItemComparator
                    ? [...group.rows]
                        .sort((a, b) => listItemComparator(a.item, b.item))
                        .map((r) => ({ item: r.item, depth: 0 as const }))
                    : group.rows
                  ).map(({ item, depth }) => {
                    const typeInfo = typeConfig[item.type] || typeConfig.task!;
                    const priorityStyle = priorityColors[item.priority] || priorityColors.medium!;
                    return (
                      <WorkItemRow
                        key={item.id}
                        item={item}
                        depth={depth}
                        typeInfo={typeInfo}
                        priorityStyle={priorityStyle}
                        canWriteTracker
                        onStatusChange={onStatusChange}
                        onPrefetchComments={onPrefetchComments}
                        onOpenItem={onOpenItem}
                      />
                    );
                  })}
                </>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};

export default EpicView;
