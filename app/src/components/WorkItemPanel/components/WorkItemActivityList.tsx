import { Activity, CheckCircle2, Edit, GitBranch, Trash2, User as UserIcon } from 'lucide-react';
import type { ActivityResponse } from '@/client';
import { formatTimeAgo } from '@/lib/relativeTime';
import { getInitials } from '@/lib/stringUtils';

interface WorkItemActivityListProps {
  activities: ActivityResponse[];
  loading: boolean;
}

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  status: 'Status',
  priority: 'Priority',
  story_points: 'Story points',
  estimated_hours: 'Estimated hours',
  type: 'Type',
  tags: 'Tags',
  acceptance_criteria: 'Acceptance criteria',
  attachments: 'Attachments',
  start_date: 'Start date',
  due_date: 'Due date',
  epic_id: 'Epic',
  parent_id: 'Parent',
  sprint_id: 'Sprint',
  goal_id: 'Goal',
  reporter_id: 'Reporter',
};

const humanizeField = (f: string) => FIELD_LABELS[f] ?? f.replace(/_/g, ' ');

const actionIcon = (action: string) => {
  switch (action) {
    case 'created':
      return <GitBranch className="w-3.5 h-3.5 text-[#E0B954]" />;
    case 'completed':
      return <CheckCircle2 className="w-3.5 h-3.5 text-[#34D399]" />;
    case 'deleted':
      return <Trash2 className="w-3.5 h-3.5 text-[#EF4444]" />;
    case 'reassigned':
      return <UserIcon className="w-3.5 h-3.5 text-[#06B6D4]" />;
    case 'updated':
      return <Edit className="w-3.5 h-3.5 text-[#F59E0B]" />;
    default:
      return <Activity className="w-3.5 h-3.5 text-[#737373]" />;
  }
};

interface FieldChange {
  field: string;
  old_value: unknown;
  new_value: unknown;
}

/** Pull the structured field-diff out of an activity's opaque `details` JSON. */
const getChanges = (details: ActivityResponse['details']): FieldChange[] => {
  const raw = details?.changes;
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is FieldChange => typeof c === 'object' && c !== null && 'field' in c);
};

const fmtValue = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length ? `${v.length} item${v.length === 1 ? '' : 's'}` : '—';
  return String(v);
};

const UNASSIGNED = new Set(['—', 'Unassigned', '']);

/**
 * Build a natural-sentence headline for an activity — the way the old comment
 * thread read ("Moved to Done", "Transferred from X to Y") rather than a raw
 * field diff. Returns null when there's no special-cased phrasing, so the
 * caller falls back to the per-field diff lines or the stored title.
 */
const headlineFor = (a: ActivityResponse, changes: FieldChange[]): string | null => {
  const status = changes.find((c) => c.field === 'status');
  const assignee = changes.find((c) => c.field === 'assignee');

  if (assignee) {
    const from = fmtValue(assignee.old_value);
    const to = fmtValue(assignee.new_value);
    if (UNASSIGNED.has(to))
      return from && !UNASSIGNED.has(from) ? `Unassigned from ${from}` : 'Unassigned';
    if (UNASSIGNED.has(from)) return `Assigned to ${to}`;
    return `Transferred from ${from} to ${to}`;
  }
  if (status) return `Moved to ${fmtValue(status.new_value)}`;
  if (a.action === 'created') return 'Created this ticket';
  if (a.action === 'deleted') return 'Deleted this ticket';
  return null;
};

export const WorkItemActivityList = ({ activities, loading }: WorkItemActivityListProps) => {
  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-16 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]"
          />
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return <div className="text-center py-6 text-[#737373] text-sm">No activity yet.</div>;
  }

  return (
    <div className="space-y-3">
      {activities.map((a) => {
        const changes = getChanges(a.details);
        const headline = headlineFor(a, changes);
        // Field edits (no special headline) read as "Priority: medium → high"
        // lines, like the old "Edited — …" comment. Status/assignee already
        // collapse into the headline, so exclude them here.
        const editLines = headline ? [] : changes.filter((c) => c.field !== 'status');
        return (
          <div
            key={a.id}
            className="p-3 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-6 h-6 rounded-full bg-[rgba(224,185,84,0.2)] flex items-center justify-center text-[10px] font-semibold text-[#E0B954]">
                {getInitials(a.user_name)}
              </div>
              <span className="text-sm font-medium text-[#f5f5f5]">{a.user_name}</span>
              {actionIcon(a.action)}
              {a.created_at && (
                <span className="text-xs text-[#737373] ml-auto">
                  {formatTimeAgo(a.created_at)}
                </span>
              )}
            </div>
            {headline ? (
              <p className="text-sm text-[#d4d4d4] leading-relaxed">{headline}</p>
            ) : editLines.length > 0 ? (
              <ul className="space-y-0.5">
                {editLines.map((c, i) => (
                  <li key={i} className="text-sm text-[#a3a3a3]">
                    <span className="text-[#737373]">{humanizeField(c.field)}:</span>{' '}
                    {fmtValue(c.old_value)} <span className="text-[#555]">→</span>{' '}
                    <span className="text-[#d4d4d4]">{fmtValue(c.new_value)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              a.title && <p className="text-sm text-[#a3a3a3] leading-relaxed">{a.title}</p>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default WorkItemActivityList;
