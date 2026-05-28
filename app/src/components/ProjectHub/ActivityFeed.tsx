import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Activity,
  GitBranch,
  CheckCircle2,
  MessageSquare,
  Clock,
  User,
  Edit,
  Trash2,
  Search,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatTimeAgo } from '@/lib/relativeTime';

interface ActivityItem {
  id: number;
  action: string;
  entity_type: string;
  entity_id?: number;
  title: string;
  details?: Record<string, any>;
  created_at: string;
  user_name: string;
  user_email?: string;
}

interface ActivityFeedProps {
  activities: ActivityItem[];
  maxItems?: number;
}

const PAGE_SIZE = 10;

const ActivityFeed: React.FC<ActivityFeedProps> = ({ activities }) => {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState('');

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'created':
        return <GitBranch className="w-4 h-4 text-[#E0B954]" />;
      case 'updated':
        return <Edit className="w-4 h-4 text-[#F59E0B]" />;
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-[#34D399]" />;
      case 'deleted':
        return <Trash2 className="w-4 h-4 text-[#EF4444]" />;
      case 'commented':
        return <MessageSquare className="w-4 h-4 text-[#60A5FA]" />;
      case 'logged_hours':
        return <Clock className="w-4 h-4 text-[#C79E3B]" />;
      case 'assigned':
        return <User className="w-4 h-4 text-[#06B6D4]" />;
      default:
        return <Activity className="w-4 h-4 text-[#737373]" />;
    }
  };

  const getEntityTypeColor = (entityType: string) => {
    switch (entityType) {
      case 'work_item':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'sprint':
        return 'bg-[#E0B954]/15 text-[#E0B954] border-[#E0B954]/30';
      case 'goal':
        return 'bg-[#E0B954]/15 text-[#E0B954] border-[#E0B954]/30';
      case 'milestone':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'project':
        return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const filtered = searchQuery.trim()
    ? activities.filter(
        (a) =>
          a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.user_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.entity_type.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : activities;

  const displayedActivities = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <Card className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Activity Feed
            <span className="text-xs font-normal text-[#737373] bg-[rgba(255,255,255,0.05)] px-2 py-0.5 rounded-full">
              {filtered.length}
            </span>
          </CardTitle>
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#737373]" />
            <Input
              placeholder="Search activity..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              className="pl-8 h-8 text-xs bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-lg focus:border-[#E0B954]/50"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {displayedActivities.length === 0 ? (
          <div className="text-center py-12">
            <Activity className="w-12 h-12 text-[#737373] mx-auto mb-2" />
            <p className="text-[#737373]">
              {searchQuery ? 'No matching activity' : 'No activity yet'}
            </p>
            <p className="text-[#737373] text-sm">
              {searchQuery
                ? 'Try a different search term'
                : 'Activity will appear here as the project progresses'}
            </p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-[rgba(255,255,255,0.05)]" />
            <div className="space-y-4">
              {displayedActivities.map((activity) => (
                <div key={activity.id} className="relative flex items-start gap-4 pl-10">
                  <div className="absolute left-3 w-4 h-4 rounded-full bg-[#0d0d0d] border-2 border-[rgba(255,255,255,0.08)] flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-[#E0B954]" />
                  </div>
                  <div className="flex-1 p-3 bg-[#0A0A14] rounded-lg border border-[rgba(255,255,255,0.05)]">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-6 h-6 bg-[#E0B954]">
                          <AvatarFallback className="bg-[#E0B954] text-white text-xs">
                            {getInitials(activity.user_name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-white font-medium text-sm">{activity.user_name}</span>
                        {getActionIcon(activity.action)}
                      </div>
                      <span className="text-[#737373] text-xs">
                        {formatTimeAgo(activity.created_at)}
                      </span>
                    </div>
                    <p className="text-[#a3a3a3] text-sm mb-2">{activity.title}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={getEntityTypeColor(activity.entity_type)}>
                        {activity.entity_type.replace('_', ' ')}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="border-[rgba(255,255,255,0.08)] text-[#737373]"
                      >
                        {activity.action}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(hasMore || visibleCount > PAGE_SIZE) && (
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-[rgba(255,255,255,0.05)]">
            <span className="text-xs text-[#737373]">
              Showing {Math.min(visibleCount, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-2">
              {visibleCount > PAGE_SIZE && (
                <button
                  onClick={() => setVisibleCount(PAGE_SIZE)}
                  className="text-xs text-[#737373] hover:text-white px-3 py-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                >
                  Show less
                </button>
              )}
              {hasMore && (
                <button
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  className="text-xs text-[#E0B954] hover:text-[#F3D57E] px-3 py-1.5 rounded-lg bg-[#E0B954]/10 hover:bg-[#E0B954]/15 transition-colors font-medium"
                >
                  View more (+{Math.min(PAGE_SIZE, filtered.length - visibleCount)})
                </button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ActivityFeed;
