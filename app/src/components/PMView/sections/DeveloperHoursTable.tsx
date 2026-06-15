import React, { useState } from 'react';
import { Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { HoursAnalytics } from '../types';

interface DeveloperHoursTableProps {
  analytics: HoursAnalytics;
}

export default function DeveloperHoursTable({ analytics }: DeveloperHoursTableProps) {
  const [expandedDeveloper, setExpandedDeveloper] = useState<number | null>(null);
  const [expandedView, setExpandedView] = useState<'capacity' | 'logged'>('capacity');

  const toggleDeveloperExpand = (devId: number) => {
    setExpandedDeveloper(expandedDeveloper === devId ? null : devId);
    setExpandedView('capacity'); // every fresh expansion starts on the capacity view
  };

  return (
    <Card className="bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.05)]">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Users className="w-5 h-5" />
          Developer Hours Summary
        </CardTitle>
        <p className="text-xs text-[#737373] mt-1">
          Click on a developer row to see detailed ticket breakdown.
          <span className="text-[#C79E3B]">
            {' '}
            Hours are attributed to the person who logged them.
          </span>
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.05)]">
                <th className="text-left py-3 px-4 text-xs font-medium text-[#737373] uppercase">
                  Developer
                </th>
                <th className="text-left py-3 px-4 text-xs font-medium text-[#737373] uppercase">
                  Role
                </th>
                <th className="text-right py-3 px-4 text-xs font-medium text-[#737373] uppercase">
                  Allocated
                </th>
                <th
                  className="text-right py-3 px-4 text-xs font-medium text-[#737373] uppercase"
                  title="All-time hours logged on this project. Click any cell to see the weekly breakdown."
                >
                  Total Logged
                </th>
                <th className="text-right py-3 px-4 text-xs font-medium text-[#C79E3B] uppercase">
                  This Week
                </th>
                <th className="text-right py-3 px-4 text-xs font-medium text-[#737373] uppercase">
                  Remaining
                </th>
                <th className="text-right py-3 px-4 text-xs font-medium text-[#737373] uppercase">
                  Done
                </th>
              </tr>
            </thead>
            <tbody>
              {analytics.developer_hours.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#737373]">
                    No developers assigned to this project
                  </td>
                </tr>
              ) : (
                analytics.developer_hours.map((dev) => {
                  const isExpanded = expandedDeveloper === dev.developer_id;

                  return (
                    <React.Fragment key={dev.developer_id}>
                      <tr
                        className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] cursor-pointer"
                        onClick={() => toggleDeveloperExpand(dev.developer_id)}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center text-white text-sm font-semibold">
                              {dev.developer_name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm text-white">{dev.developer_name}</p>
                              <p className="text-xs text-[#737373]">{dev.developer_email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant="outline"
                            className="border-[rgba(255,255,255,0.08)] text-[#a3a3a3]"
                          >
                            {dev.role}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-sm text-right text-white">
                          {dev.allocated_hours}h
                        </td>
                        <td className="py-3 px-4 text-sm text-right">
                          <span
                            className={dev.logged_hours > 0 ? 'text-[#E0B954]' : 'text-[#737373]'}
                          >
                            {dev.logged_hours}h
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm min-w-[260px]">
                          {(() => {
                            const inProgressH = dev.this_week_in_progress_hours ?? 0;
                            const inReviewH = dev.this_week_in_review_hours ?? 0;
                            const doneH = dev.this_week_done_hours ?? 0;
                            const capUsed = dev.this_week_capacity_used ?? 0;
                            return (
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center gap-2 w-full max-w-[220px]">
                                  <div className="flex-1 h-2 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden flex">
                                    {capUsed > 0 && (
                                      <>
                                        <div
                                          className="h-full bg-[#E0B954]"
                                          style={{
                                            width: `${Math.min(100, (inProgressH / 40) * 100)}%`,
                                          }}
                                          title={`${inProgressH}h in-progress`}
                                        />
                                        <div
                                          className="h-full bg-[#A78BFA]"
                                          style={{
                                            width: `${Math.min(100, (inReviewH / 40) * 100)}%`,
                                          }}
                                          title={`${inReviewH}h in-review`}
                                        />
                                        <div
                                          className="h-full bg-[#34D399]"
                                          style={{
                                            width: `${Math.min(100, (doneH / 40) * 100)}%`,
                                          }}
                                          title={`${doneH}h done`}
                                        />
                                      </>
                                    )}
                                  </div>
                                  <span
                                    className={`text-xs font-mono tabular-nums whitespace-nowrap ${capUsed > 0 ? 'text-[#C79E3B] font-semibold' : 'text-[#737373]'}`}
                                  >
                                    {capUsed}h/40h
                                  </span>
                                </div>
                                <div className="text-[10px] text-[#737373] flex items-center gap-1.5 flex-wrap justify-end">
                                  <span className="flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-sm bg-[#E0B954]" />
                                    {inProgressH}h prog
                                  </span>
                                  <span className="text-[rgba(255,255,255,0.15)]">·</span>
                                  <span className="flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-sm bg-[#A78BFA]" />
                                    {inReviewH}h rev
                                  </span>
                                  <span className="text-[rgba(255,255,255,0.15)]">·</span>
                                  <span className="flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-sm bg-[#34D399]" />
                                    {doneH}h done
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="py-3 px-4 text-sm text-right">
                          <span
                            className={
                              dev.remaining_hours > 0 ? 'text-[#F59E0B]' : 'text-[#737373]'
                            }
                          >
                            {dev.remaining_hours}h
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-right">
                          <Badge className="bg-[#E0B954]/20 text-[#E0B954] border-0">
                            {dev.completed_items}/{dev.total_items}
                          </Badge>
                        </td>
                      </tr>

                      {/* Expanded Detail Row */}
                      {isExpanded && (
                        <tr className="bg-[rgba(255,255,255,0.01)]">
                          <td colSpan={7} className="py-4 px-4">
                            <div className="space-y-4">
                              {/* View toggle: Capacity (default) | Logged hours per week */}
                              <div className="flex items-center gap-2">
                                {(
                                  [
                                    { id: 'capacity', label: 'Capacity (this week)' },
                                    { id: 'logged', label: 'Logged hours per week' },
                                  ] as const
                                ).map((opt) => {
                                  const active = expandedView === opt.id;
                                  return (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedView(opt.id);
                                      }}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                        active
                                          ? 'bg-[#E0B954]/20 text-[#E0B954] border border-[#E0B954]/40'
                                          : 'bg-[rgba(255,255,255,0.03)] text-[#a3a3a3] border border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.06)]'
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Logged hours per week view */}
                              {expandedView === 'logged' &&
                                (() => {
                                  const history = dev.weekly_logged_history ?? [];
                                  if (history.length === 0) {
                                    return (
                                      <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-lg p-4 text-sm text-[#737373] text-center">
                                        No logged hours yet on this project.
                                      </div>
                                    );
                                  }
                                  const maxHours = Math.max(...history.map((w) => w.hours), 1);
                                  return (
                                    <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-lg p-3">
                                      <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-xs font-semibold text-white">
                                          Logged hours per week
                                        </h4>
                                        <span className="text-xs font-mono tabular-nums text-[#E0B954]">
                                          {dev.logged_hours}h total · {history.length}{' '}
                                          {history.length === 1 ? 'week' : 'weeks'}
                                        </span>
                                      </div>
                                      <ul className="space-y-2">
                                        {history.map((w) => {
                                          // Backend buckets Sat→Fri; for display we show Mon→Fri
                                          // (skip the weekend, same underlying bucket).
                                          const satStart = new Date(w.week_start);
                                          const monStart = new Date(
                                            satStart.getTime() + 2 * 24 * 60 * 60 * 1000,
                                          );
                                          const friEnd = new Date(w.week_end);
                                          const pct = Math.round((w.hours / maxHours) * 100);
                                          return (
                                            <li key={w.week_start} className="space-y-1">
                                              <div className="flex items-center justify-between text-xs">
                                                <span className="text-[#a3a3a3] font-mono">
                                                  {monStart.toLocaleDateString(undefined, {
                                                    month: 'short',
                                                    day: 'numeric',
                                                  })}
                                                  {' → '}
                                                  {friEnd.toLocaleDateString(undefined, {
                                                    month: 'short',
                                                    day: 'numeric',
                                                  })}
                                                </span>
                                                <span className="text-[#E0B954] font-mono tabular-nums">
                                                  {w.hours}h
                                                </span>
                                              </div>
                                              <div className="h-1.5 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                                                <div
                                                  className="h-full bg-[#E0B954] rounded-full"
                                                  style={{ width: `${pct}%` }}
                                                />
                                              </div>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    </div>
                                  );
                                })()}

                              {/* This Week — by status breakdown (Sat-Fri) */}
                              {expandedView === 'capacity' &&
                                dev.this_week_tickets &&
                                dev.this_week_tickets.length > 0 && (
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <h4 className="text-xs font-medium text-[#C79E3B] uppercase">
                                        This Week — by status
                                      </h4>
                                      {dev.week_start && dev.week_end && (
                                        <span className="text-[10px] text-[#737373] font-mono">
                                          {new Date(dev.week_start).toLocaleDateString(undefined, {
                                            month: 'short',
                                            day: 'numeric',
                                          })}
                                          {' → '}
                                          {new Date(dev.week_end).toLocaleDateString(undefined, {
                                            month: 'short',
                                            day: 'numeric',
                                          })}
                                          {' (Sat → Fri, UTC)'}
                                        </span>
                                      )}
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                      {(
                                        [
                                          {
                                            key: 'in_progress',
                                            label: 'In progress',
                                            color: '#E0B954',
                                            total: dev.this_week_in_progress_hours ?? 0,
                                          },
                                          {
                                            key: 'in_review',
                                            label: 'In review',
                                            color: '#A78BFA',
                                            total: dev.this_week_in_review_hours ?? 0,
                                          },
                                          {
                                            key: 'done',
                                            label: 'Done this week',
                                            color: '#34D399',
                                            total: dev.this_week_done_hours ?? 0,
                                          },
                                        ] as const
                                      ).map((group) => {
                                        const groupTickets = (dev.this_week_tickets ?? []).filter(
                                          (t) => t.status === group.key,
                                        );
                                        return (
                                          <div
                                            key={group.key}
                                            className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-lg p-3"
                                          >
                                            <div className="flex items-center justify-between mb-2">
                                              <div className="flex items-center gap-2">
                                                <span
                                                  className="w-2 h-2 rounded-sm"
                                                  style={{ background: group.color }}
                                                />
                                                <span className="text-xs font-semibold text-white">
                                                  {group.label}
                                                </span>
                                                <span className="text-[10px] text-[#737373]">
                                                  ({groupTickets.length})
                                                </span>
                                              </div>
                                              <span
                                                className="text-xs font-mono tabular-nums"
                                                style={{ color: group.color }}
                                              >
                                                {group.total}h
                                              </span>
                                            </div>
                                            {groupTickets.length === 0 ? (
                                              <div className="text-[11px] text-[#737373] py-1">
                                                No tickets
                                              </div>
                                            ) : (
                                              <ul className="space-y-1.5">
                                                {groupTickets.map((t) => (
                                                  <li
                                                    key={t.id}
                                                    className="flex items-start gap-2 text-xs"
                                                  >
                                                    <span className="font-mono text-[#E0B954] mt-0.5 flex-shrink-0">
                                                      {t.key}
                                                    </span>
                                                    <div className="flex-1 min-w-0">
                                                      <div className="text-white truncate">
                                                        {t.title}
                                                      </div>
                                                      <div className="text-[10px] text-[#737373] mt-0.5 flex items-center gap-1.5 flex-wrap">
                                                        <span>est {t.estimated_hours}h</span>
                                                        <span className="text-[rgba(255,255,255,0.15)]">
                                                          ·
                                                        </span>
                                                        <span>logged {t.logged_hours}h</span>
                                                        {t.counted_basis ===
                                                          'remaining (transferred)' && (
                                                          <span className="px-1 py-0.5 rounded bg-[#FBBF24]/15 text-[#FBBF24] text-[9px] font-semibold uppercase tracking-wider">
                                                            transferred
                                                          </span>
                                                        )}
                                                      </div>
                                                    </div>
                                                    <span
                                                      className="font-mono tabular-nums flex-shrink-0"
                                                      style={{ color: group.color }}
                                                      title={`Counted as ${t.counted_basis}`}
                                                    >
                                                      +{t.counted_hours}h
                                                    </span>
                                                  </li>
                                                ))}
                                              </ul>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                              <p className="text-xs text-[#737373] italic">
                                {dev.attribution_note}
                              </p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
