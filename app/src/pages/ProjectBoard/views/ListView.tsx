import { Eye, EyeOff, CheckCircle2, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Empty, EmptyTitle } from '@/components/ui/empty';
import type { WorkItem } from '@/types/workItems';
import { parseLocalDate, formatWeekRange } from '../lib/listGrouping';
import type { ListSortKey } from '../lib/listSort';
import ListSortHeader from './components/ListSortHeader';
import WorkItemRow, {
  type WorkItemRowTypeConfig,
  type WorkItemRowPriorityStyle,
} from './components/WorkItemRow';

/** Sprint-grouped bucket shape (from useListGrouping's listViewGroups memo). */
export interface ListViewSprintGroup {
  key: string;
  label: string;
  isCompleted: boolean;
  items: WorkItem[];
}

/** Week-grouped bucket shape (from useListGrouping's listViewWeekGroups memo). */
export interface ListViewWeekGroup {
  key: string;
  weekStart: string;
  label: string;
  isCurrent: boolean;
  isPast: boolean;
  items: WorkItem[];
}

export interface ListViewProps {
  /** Sprint-grouped buckets (active when listGroupBy === 'sprint'). */
  listViewGroups: ListViewSprintGroup[];
  /** Week-grouped buckets (active when listGroupBy === 'week'). */
  listViewWeekGroups: ListViewWeekGroup[];
  /** Group-by toggle state + setter (shared with the header radio group). */
  listGroupBy: 'sprint' | 'week';
  setListGroupBy: (mode: 'sprint' | 'week') => void;
  /** Per-group collapse set + toggle. */
  collapsedSprints: Set<string>;
  toggleSprintCollapse: (key: string) => void;
  /** Completed-sprints visibility toggle (sprint grouping only). */
  showCompletedSprints: boolean;
  setShowCompletedSprints: (updater: (v: boolean) => boolean) => void;
  /** Day-midnight ms used to flag overdue due dates in the week grouping. */
  todayMidnightMs: number;
  // ── Sort bag (from useListSort) ─────────────────────────────────────────
  listSortKey: ListSortKey | null;
  listSortDir: 'asc' | 'desc';
  handleListSort: (key: ListSortKey) => void;
  listItemComparator: ((a: WorkItem, b: WorkItem) => number) | null;
  // ── Type/priority config maps (still owned by the orchestrator) ─────────
  typeConfig: Record<string, WorkItemRowTypeConfig>;
  priorityColors: Record<string, WorkItemRowPriorityStyle>;
  /** Status write gate — read-only text vs StatusDotMenu in each row. */
  canWriteTracker: boolean;
  /**
   * Whether the current user may manage sprints (complete/edit/delete). The
   * orchestrator computes this from `project.pm` capability + project-creator/
   * admin developer overrides; threaded in so the view stays props-down.
   */
  canManageSprints: boolean;
  // ── Row callbacks ───────────────────────────────────────────────────────
  onStatusChange: (item: WorkItem, newStatus: string) => void;
  onPrefetchComments: (itemId: string) => void;
  onOpenItem: (itemId: string) => void;
  // ── Sprint-action triggers (sprint grouping headers) ────────────────────
  onCompleteSprint: (sprintId: number) => void;
  onEditSprint: (sprintKey: string) => void;
  onDeleteSprint: (sprintId: number) => void;
}

/**
 * List view body — extracted verbatim from ProjectBoard's `viewMode === 'list'`
 * block: the By Sprint / By Week group-by toggle, the completed-sprints toggle,
 * and the sprint-group + week-group renderers. Each group's rows are the shared
 * WorkItemRow; headers are the shared ListSortHeader. Pure props-down.
 *
 * Behavior preserved: sprint rows keep the StatusDotMenu write-gate and no
 * overdue/completed coloring; week rows add overdue (red) + completed (gold)
 * coloring; both apply the active comparator within each group.
 */
const ListView = ({
  listViewGroups,
  listViewWeekGroups,
  listGroupBy,
  setListGroupBy,
  collapsedSprints,
  toggleSprintCollapse,
  showCompletedSprints,
  setShowCompletedSprints,
  todayMidnightMs,
  listSortKey,
  listSortDir,
  handleListSort,
  listItemComparator,
  typeConfig,
  priorityColors,
  canWriteTracker,
  canManageSprints,
  onStatusChange,
  onPrefetchComments,
  onOpenItem,
  onCompleteSprint,
  onEditSprint,
  onDeleteSprint,
}: ListViewProps) => {
  const sortHeaderRow = (
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
  );

  return (
    <div role="tabpanel" id="tabpanel-list" aria-labelledby="tab-list" className="p-6 space-y-3">
      {/* List view header: Group by toggle + completed-sprints toggle */}
      <div className="flex items-center justify-between gap-3">
        <div
          role="radiogroup"
          aria-label="Group list by"
          className="flex items-center bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-lg p-0.5"
        >
          <button
            type="button"
            role="radio"
            aria-checked={listGroupBy === 'sprint'}
            onClick={() => setListGroupBy('sprint')}
            className={`px-2.5 h-6 text-[11px] rounded-md transition-colors ${listGroupBy === 'sprint' ? 'bg-brand text-[#080808] font-medium' : 'text-[#737373] hover:text-white'}`}
          >
            By Sprint
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={listGroupBy === 'week'}
            onClick={() => setListGroupBy('week')}
            className={`px-2.5 h-6 text-[11px] rounded-md transition-colors ${listGroupBy === 'week' ? 'bg-brand text-[#080808] font-medium' : 'text-[#737373] hover:text-white'}`}
          >
            By Week
          </button>
        </div>
        {listGroupBy === 'sprint' && (
          <button
            onClick={() => setShowCompletedSprints((v) => !v)}
            className="flex items-center gap-1.5 px-3 h-7 text-xs border border-[rgba(255,255,255,0.1)] rounded-lg text-[#737373] hover:text-white hover:border-[rgba(255,255,255,0.2)] transition-colors"
          >
            {showCompletedSprints ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {showCompletedSprints ? 'Hide Completed Sprints' : 'Show Completed Sprints'}
          </button>
        )}
      </div>

      {listGroupBy === 'week' ? (
        listViewWeekGroups.length === 0 ? (
          <Empty className="py-16">
            <EmptyTitle className="text-[#737373] text-sm font-normal">No items found</EmptyTitle>
          </Empty>
        ) : (
          listViewWeekGroups.map((group) => {
            const isCollapsed = collapsedSprints.has(group.key);
            return (
              <div
                key={group.key}
                className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl overflow-hidden"
              >
                {/* Week group header */}
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
                    <span className="text-sm font-semibold text-[#f5f5f5]">{group.label}</span>
                    {group.weekStart && group.label !== formatWeekRange(group.weekStart) && (
                      <span className="text-[10px] text-[#555555]">
                        {formatWeekRange(group.weekStart)}
                      </span>
                    )}
                    {group.isCurrent && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.12)] text-muted-foreground">
                        Current
                      </span>
                    )}
                    <span className="text-xs text-[#737373]">
                      {group.items.length} item{group.items.length !== 1 ? 's' : ''}
                    </span>
                  </button>
                </div>

                {!isCollapsed && (
                  <>
                    {sortHeaderRow}
                    {/* Table rows */}
                    {(listItemComparator
                      ? [...group.items].sort(listItemComparator)
                      : group.items
                    ).map((item) => {
                      const typeInfo = typeConfig[item.type] || typeConfig.task!;
                      const priorityStyle = priorityColors[item.priority] || priorityColors.medium!;
                      const dueDate = item.due_date ? parseLocalDate(item.due_date) : null;
                      const isOverdue =
                        !!dueDate && !item.completed_at && dueDate.getTime() < todayMidnightMs;
                      return (
                        <WorkItemRow
                          key={item.id}
                          item={item}
                          typeInfo={typeInfo}
                          priorityStyle={priorityStyle}
                          canWriteTracker={canWriteTracker}
                          isOverdue={isOverdue}
                          highlightCompleted
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
        )
      ) : listViewGroups.length === 0 ? (
        <Empty className="py-16">
          <EmptyTitle className="text-[#737373] text-sm font-normal">No items found</EmptyTitle>
        </Empty>
      ) : (
        listViewGroups.map((group) => {
          const isCollapsed = collapsedSprints.has(group.key);
          return (
            <div
              key={group.key}
              className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-2xl overflow-hidden"
            >
              {/* Sprint group header */}
              <div className="flex items-center gap-2.5 px-5 py-3.5 hover:bg-[rgba(255,255,255,0.02)] transition-colors group/sprint-hdr">
                <button
                  onClick={() => toggleSprintCollapse(group.key)}
                  className="flex items-center gap-2.5 flex-1 text-left min-w-0"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5 text-[#737373] shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-[#737373] shrink-0" />
                  )}
                  <span className="text-sm font-semibold text-[#f5f5f5]">{group.label}</span>
                  {group.isCompleted && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.05)] text-[#555555]">
                      Completed
                    </span>
                  )}
                  <span className="text-xs text-[#737373]">
                    {group.items.length} item{group.items.length !== 1 ? 's' : ''}
                  </span>
                </button>
                {group.key !== 'backlog' && canManageSprints && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    {!group.isCompleted && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onCompleteSprint(parseInt(group.key));
                        }}
                        className="p-1.5 rounded-md hover:bg-[rgba(255,255,255,0.12)] text-[#737373] hover:text-muted-foreground transition-colors"
                        title="Complete sprint"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditSprint(group.key);
                      }}
                      className="p-1.5 rounded-md hover:bg-[rgba(255,255,255,0.06)] text-[#737373] hover:text-white transition-colors"
                      title="Edit sprint"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSprint(parseInt(group.key));
                      }}
                      className="p-1.5 rounded-md hover:bg-[rgba(239,68,68,0.08)] text-[#737373] hover:text-[#EF4444] transition-colors"
                      title="Delete sprint"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {!isCollapsed && (
                <>
                  {sortHeaderRow}
                  {/* Table rows */}
                  {(listItemComparator
                    ? [...group.items].sort(listItemComparator)
                    : group.items
                  ).map((item) => {
                    const typeInfo = typeConfig[item.type] || typeConfig.task!;
                    const priorityStyle = priorityColors[item.priority] || priorityColors.medium!;
                    return (
                      <WorkItemRow
                        key={item.id}
                        item={item}
                        typeInfo={typeInfo}
                        priorityStyle={priorityStyle}
                        canWriteTracker={canWriteTracker}
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

export default ListView;
