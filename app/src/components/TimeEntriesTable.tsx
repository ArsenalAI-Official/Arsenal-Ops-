import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/config/api';
import { Clock, ChevronDown, ChevronUp } from 'lucide-react';

interface TimeEntry {
  id: number;
  developer_id: number;
  developer_name: string;
  hours: number;
  description?: string;
  logged_at: string;
  is_this_week: boolean;
}

interface TimeEntriesTableProps {
  workItemId: string;
  token: string;
}

export default function TimeEntriesTable({ workItemId, token }: TimeEntriesTableProps) {
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [thisWeekTotal, setThisWeekTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (expanded) {
      fetchTimeEntries();
    }
  }, [expanded, workItemId]);

  const fetchTimeEntries = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/workitems/${workItemId}/time-entries?this_week_only=true`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setTimeEntries(data.time_entries || []);
        setThisWeekTotal(data.this_week_total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch time entries:', err);
    } finally {
      setLoading(false);
    }
  };

  if (thisWeekTotal === 0 && !expanded) {
    return null; // Don't show if no hours logged this week
  }

  return (
    <div className="mt-2 border-t border-[rgba(255,255,255,0.05)] pt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[10px] text-[#C79E3B] hover:text-[#E0B954] transition-colors"
      >
        <Clock className="w-3 h-3" />
        <span>This Week: {thisWeekTotal}h logged</span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="mt-2 bg-[rgba(0,0,0,0.2)] rounded p-2">
          {loading ? (
            <div className="text-[10px] text-[#737373]">Loading...</div>
          ) : timeEntries.length === 0 ? (
            <div className="text-[10px] text-[#737373]">No hours logged this week</div>
          ) : (
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-[#737373] border-b border-[rgba(255,255,255,0.05)]">
                  <th className="text-left py-1">Who</th>
                  <th className="text-right py-1">Hours</th>
                  <th className="text-right py-1">When</th>
                </tr>
              </thead>
              <tbody>
                {timeEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-[rgba(255,255,255,0.03)]">
                    <td className="py-1 text-white truncate max-w-[80px]">
                      {entry.developer_name}
                    </td>
                    <td className="py-1 text-right text-[#E0B954]">{entry.hours}h</td>
                    <td className="py-1 text-right text-[#737373]">
                      {new Date(entry.logged_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[rgba(255,255,255,0.1)]">
                  <td className="py-1 text-[#737373]">Total</td>
                  <td className="py-1 text-right text-[#C79E3B] font-medium">{thisWeekTotal}h</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
