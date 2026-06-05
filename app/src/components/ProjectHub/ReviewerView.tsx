import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Eye,
  Clock,
  CheckCircle2,
  MessageSquare,
  Send,
  User,
  Calendar,
  Clock3,
} from 'lucide-react';
import { toast } from 'sonner';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/contexts/AuthContext';
import { PRIORITY_COLOR } from '@/lib/workItemConfig';
import { Spinner } from '@/components/ui/spinner';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';

interface WorkItem {
  id: string;
  key: string;
  title: string;
  status: string;
  priority: string;
  assignee?: string;
  assignee_id?: number;
  due_date?: string;
  estimated_hours?: number;
  logged_hours?: number;
  remaining_hours?: number;
}

interface Comment {
  id: number;
  content: string;
  author_name: string;
  created_at: string;
}

interface ReviewerViewProps {
  workItems: WorkItem[];
  projectId: string;
  token: string;
  onTaskUpdate?: (itemId: string, updates: any) => void;
}

const ReviewerView: React.FC<ReviewerViewProps> = ({
  workItems,
  projectId: _projectId,
  token,
  onTaskUpdate,
}) => {
  const { user } = useAuth();
  // Only the ticket's assignee can log hours (matches backend enforcement).
  // ReviewerView has no project-developer list to map email→developer id, so we
  // compare by display name. Fragile in edge cases (renames, duplicates) but the
  // backend rejects mismatches with 403 anyway — this is just UI hide.
  const isAssigneeOf = (item: WorkItem) =>
    !!user?.name && !!item.assignee && user.name === item.assignee;
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [newComment, setNewComment] = useState<Record<string, string>>({});
  const [logHoursInput, setLogHoursInput] = useState<Record<string, string>>({});
  const [showLogHours, setShowLogHours] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  // Filter to in_review items only
  const reviewItems = workItems.filter((item) => item.status === 'in_review');

  // Fetch comments for each review item
  useEffect(() => {
    reviewItems.forEach((item) => {
      fetchComments(item.id);
    });
  }, [reviewItems.length]);

  const fetchComments = async (itemId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/comments/workitem/${itemId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setComments((prev) => ({ ...prev, [itemId]: data }));
      }
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    }
  };

  const handleAddComment = async (itemId: string) => {
    const content = newComment[itemId]?.trim();
    if (!content) return;

    setLoading((prev) => ({ ...prev, [`comment-${itemId}`]: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/api/comments/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          work_item_id: parseInt(itemId),
          content,
        }),
      });

      if (res.ok) {
        setNewComment((prev) => ({ ...prev, [itemId]: '' }));
        await fetchComments(itemId);
        toast.success('Comment added');
      } else {
        toast.error('Failed to add comment');
      }
    } catch (err) {
      toast.error('Failed to add comment');
    } finally {
      setLoading((prev) => ({ ...prev, [`comment-${itemId}`]: false }));
    }
  };

  const handleLogHours = async (itemId: string) => {
    const hours = parseFloat(logHoursInput[itemId]);
    if (!hours || hours <= 0) {
      toast.error('Please enter valid hours');
      return;
    }

    setLoading((prev) => ({ ...prev, [`log-${itemId}`]: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/api/workitems/${itemId}/log-hours`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ hours, description: 'Reviewed and logged' }),
      });

      if (res.ok) {
        setLogHoursInput((prev) => ({ ...prev, [itemId]: '' }));
        setShowLogHours((prev) => ({ ...prev, [itemId]: false }));
        toast.success(`${hours}h logged`);
        // Refresh parent
        onTaskUpdate?.(itemId, {});
      } else {
        toast.error('Failed to log hours');
      }
    } catch (err) {
      toast.error('Failed to log hours');
    } finally {
      setLoading((prev) => ({ ...prev, [`log-${itemId}`]: false }));
    }
  };

  const handleMarkDone = async (itemId: string) => {
    setLoading((prev) => ({ ...prev, [`done-${itemId}`]: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/api/workitems/${itemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'done' }),
      });

      if (res.ok) {
        toast.success('Marked as done');
        onTaskUpdate?.(itemId, { status: 'done' });
      } else {
        // Surface backend validation messages (e.g. "subtask still open"
        // when marking a parent done) instead of a generic toast.
        let detail = 'Failed to update status';
        try {
          const body = await res.json();
          if (body?.detail) detail = body.detail;
        } catch {
          // body wasn't JSON — keep the generic message
        }
        toast.error(detail);
      }
    } catch {
      toast.error('Failed to update status');
    } finally {
      setLoading((prev) => ({ ...prev, [`done-${itemId}`]: false }));
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'No due date';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (reviewItems.length === 0) {
    return (
      <Card className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Eye className="w-5 h-5 text-[#C79E3B]" />
            Review Queue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Eye className="text-[#737373]" />
              </EmptyMedia>
              <EmptyTitle className="text-[#737373]">No items in review</EmptyTitle>
              <EmptyDescription>Items marked "In Review" will appear here</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Eye className="w-5 h-5 text-[#C79E3B]" />
          Review Queue
          <Badge className="bg-[#C79E3B]/20 text-[#C79E3B] border-[#C79E3B]/30">
            {reviewItems.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {reviewItems.map((item) => (
          <div
            key={item.id}
            className="bg-[#0A0A14] rounded-lg p-4 border border-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.08)] transition-colors"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[#C79E3B] font-mono text-sm">{item.key}</span>
                  <Badge
                    variant="outline"
                    className="text-xs"
                    style={{
                      borderColor: PRIORITY_COLOR[item.priority] || '#737373',
                      color: PRIORITY_COLOR[item.priority] || '#737373',
                    }}
                  >
                    {item.priority}
                  </Badge>
                </div>
                <h3 className="text-white font-medium">{item.title}</h3>
              </div>
              <div className="flex items-center gap-2">
                {isAssigneeOf(item) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setShowLogHours((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                    }
                    className="text-[#737373] hover:text-[#F59E0B] hover:bg-[#F59E0B]/10"
                  >
                    <Clock className="w-4 h-4 mr-1" />
                    Log Time
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => handleMarkDone(item.id)}
                  disabled={loading[`done-${item.id}`]}
                  className="bg-[#E0B954] hover:bg-[#C79E3B] text-white"
                >
                  {loading[`done-${item.id}`] ? (
                    <Spinner size="xs" tone="white" className="w-4 h-4" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                  )}
                  Mark Done
                </Button>
              </div>
            </div>

            {/* Meta */}
            <div className="flex items-center gap-4 text-xs text-[#737373] mb-3">
              <div className="flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                {item.assignee || 'Unassigned'}
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {formatDate(item.due_date)}
              </div>
              <div className="flex items-center gap-1">
                <Clock3 className="w-3.5 h-3.5" />
                {item.estimated_hours || 0}h est / {item.logged_hours || 0}h logged
              </div>
            </div>

            {/* Log Hours Input — only renders when the toggle is on AND user is assignee */}
            {showLogHours[item.id] && isAssigneeOf(item) && (
              <div className="flex items-center gap-2 mb-3 p-3 bg-[#0d0d0d] rounded-lg">
                <Input
                  type="number"
                  placeholder="Hours"
                  min="0.5"
                  step="0.5"
                  className="w-24 bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
                  value={logHoursInput[item.id] || ''}
                  onChange={(e) =>
                    setLogHoursInput((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                />
                <Button
                  size="sm"
                  onClick={() => handleLogHours(item.id)}
                  disabled={loading[`log-${item.id}`]}
                  className="bg-[#F59E0B] hover:bg-[#D97706] text-white"
                >
                  {loading[`log-${item.id}`] ? (
                    <Spinner size="xs" tone="white" className="w-4 h-4" />
                  ) : (
                    'Log'
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLogHours((prev) => ({ ...prev, [item.id]: false }))}
                  className="text-[#737373]"
                >
                  Cancel
                </Button>
              </div>
            )}

            {/* Comments Section */}
            <div className="border-t border-[rgba(255,255,255,0.05)] pt-3">
              <div className="flex items-center gap-2 mb-2 text-sm text-[#737373]">
                <MessageSquare className="w-4 h-4" />
                Comments ({comments[item.id]?.length || 0})
              </div>

              {/* Comment List */}
              <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
                {comments[item.id]?.map((comment) => (
                  <div key={comment.id} className="bg-[#0d0d0d] rounded p-2 text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[#C79E3B] font-medium">{comment.author_name}</span>
                      <span className="text-[#737373] text-xs">
                        {new Date(comment.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-[#d4d4d4]">{comment.content}</p>
                  </div>
                ))}
                {!comments[item.id]?.length && (
                  <p className="text-[#737373] text-sm italic">No comments yet</p>
                )}
              </div>

              {/* Add Comment */}
              <div className="flex items-start gap-2">
                <Textarea
                  placeholder="Add a review comment..."
                  className="flex-1 bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white text-sm min-h-[60px] resize-none"
                  value={newComment[item.id] || ''}
                  onChange={(e) =>
                    setNewComment((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                />
                <Button
                  size="sm"
                  onClick={() => handleAddComment(item.id)}
                  disabled={loading[`comment-${item.id}`] || !newComment[item.id]?.trim()}
                  className="bg-[#E0B954] hover:bg-[#B8872A] text-white h-[60px]"
                >
                  {loading[`comment-${item.id}`] ? (
                    <Spinner size="xs" tone="white" className="w-4 h-4" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default ReviewerView;
