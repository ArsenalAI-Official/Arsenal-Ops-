// Comment handlers. Per-item comment thread (GET) + create (POST). Empty thread
// by default; the create ack returns a minimal CommentResponse.
import { http, HttpResponse } from 'msw';
import type { CommentResponse } from '@/client';
import { API_BASE } from './constants';

const NO_COMMENTS: CommentResponse[] = [];

function createdComment(): CommentResponse {
  return {
    id: 1,
    work_item_id: 1,
    author_id: 1,
    author_name: 'Test User',
    comment_type: 'comment',
    content: '',
    mentions: [],
    is_resolved: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

export const commentHandlers = [
  http.get(`${API_BASE}/comments/workitem/:id`, () => HttpResponse.json(NO_COMMENTS)),
  http.post(`${API_BASE}/comments/`, () => HttpResponse.json(createdComment())),
];
