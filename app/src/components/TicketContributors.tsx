import { Users } from 'lucide-react';
import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/config/api';
import { avatarColor } from '@/lib/avatarColor';

interface TimeEntry {
  id: number;
  developer_id: number | null;
  developer_name: string;
  hours: number;
  description?: string;
  logged_at: string | null;
}

interface ContributorRow {
  developer_id: number;
  developer_name: string;
  total_hours: number;
  this_week_hours: number;
}

interface Props {
  workItemId: string | number;
  token: string;
}

// Saturday 00:00 → Friday 23:59:59 UTC for the week containing `now`.
const getWeekBoundaries = (): [Date, Date] => {
  const now = new Date();
  const utcDay = now.getUTCDay(); // 0=Sun .. 6=Sat
  const daysSinceSat = (utcDay + 1) % 7;
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceSat, 0, 0, 0, 0),
  );
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1000);
  return [start, end];
};

export default function TicketContributors({ workItemId, token }: Props) {
  const [contributors, setContributors] = useState<ContributorRow[]>([]);
  const [totalHours, setTotalHours] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/workitems/${workItemId}/time-entries`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        const entries: TimeEntry[] = data.time_entries || [];
        const [weekStart, weekEnd] = getWeekBoundaries();

        const byDev = new Map<number, ContributorRow>();
        let total = 0;
        for (const e of entries) {
          if (e.developer_id == null) continue;
          const row = byDev.get(e.developer_id) ?? {
            developer_id: e.developer_id,
            developer_name: e.developer_name || 'Unknown',
            total_hours: 0,
            this_week_hours: 0,
          };
          row.total_hours += e.hours;
          if (e.logged_at) {
            const t = new Date(e.logged_at);
            if (t >= weekStart && t <= weekEnd) {
              row.this_week_hours += e.hours;
            }
          }
          byDev.set(e.developer_id, row);
          total += e.hours;
        }
        const list = Array.from(byDev.values()).sort((a, b) => b.total_hours - a.total_hours);
        setContributors(list);
        setTotalHours(total);
      } catch {
        // Silent — section just stays hidden.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [workItemId, token]);

  if (loading) return null;
  // Only surface when multiple people have contributed.
  if (contributors.length < 2) return null;

  return (
    <div className="pt-4 border-t border-[rgba(255,255,255,0.05)]">
      <div className="text-xs text-[#737373] mb-3 font-medium flex items-center gap-2">
        <Users className="w-3.5 h-3.5" />
        Contributors ({contributors.length}) · {totalHours}h total
      </div>
      <div className="space-y-2.5">
        {contributors.map((c) => {
          const pct = totalHours > 0 ? Math.round((c.total_hours / totalHours) * 100) : 0;
          const avatar = avatarColor(c.developer_id);
          return (
            <div key={c.developer_id} className="flex items-center gap-3">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                style={{
                  backgroundColor: avatar.bg,
                  color: avatar.fg,
                  border: `1px solid ${avatar.ring}`,
                }}
              >
                {c.developer_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-white truncate">{c.developer_name}</span>
                  <span className="text-xs font-mono tabular-nums text-muted-foreground flex-shrink-0">
                    {c.total_hours}h
                    {c.this_week_hours > 0 && (
                      <span className="ml-1 text-[10px] text-[#737373] font-sans">
                        · {c.this_week_hours}h this wk
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-1 mt-1 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                  <div className="h-full bg-progress rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span className="text-[10px] text-[#737373] tabular-nums w-9 text-right flex-shrink-0">
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
