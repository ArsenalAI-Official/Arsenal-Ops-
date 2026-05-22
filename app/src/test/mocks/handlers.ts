import { http, HttpResponse } from 'msw'

export const authHandlers = [
  http.get('/api/auth/me', () => {
    return HttpResponse.json({
      id: 1,
      email: 'user@example.com',
      name: 'Test User',
      role: 'developer',
      is_first_login: false,
    })
  }),

  http.get('/api/auth/me/capabilities', () => {
    return HttpResponse.json({
      capabilities: [],
    })
  }),
]

export const projectHandlers = [
  http.get('/api/projects/', () => {
    return HttpResponse.json([
      {
        id: 1,
        name: 'Project Alpha',
        description: 'First test project',
        key_prefix: 'PA',
        status: 'active',
        created_at: '2026-01-01T00:00:00',
        work_item_stats: {
          total: 5,
          by_status: { todo: 2, in_progress: 2, done: 1 },
          total_points: 13,
          completed: 1,
          completion_pct: 20,
        },
        developers: [],
      },
      {
        id: 2,
        name: 'Project Beta',
        description: 'Second test project',
        key_prefix: 'PB',
        status: 'active',
        created_at: '2026-01-15T00:00:00',
        work_item_stats: {
          total: 3,
          by_status: { todo: 1, in_progress: 1, done: 1 },
          total_points: 8,
          completed: 1,
          completion_pct: 33,
        },
        developers: [],
      },
    ])
  }),

  http.get('/api/personal-tasks/', () => {
    return HttpResponse.json([
      {
        id: 1,
        title: 'Setup test environment',
        description: 'Configure testing infrastructure',
        priority: 'high',
        status: 'todo',
        due_date: '2026-06-01',
        estimated_hours: 4,
        is_converted: false,
      },
    ])
  }),

  http.get('/api/workitems/my-tasks', () => {
    return HttpResponse.json([
      {
        id: 'TASK-1',
        key: 'TASK-1',
        title: 'Review PR',
        description: 'Review the pull request',
        status: 'in_progress',
        is_overdue: false,
        due_date: '2026-06-01',
      },
    ])
  }),
]

export const handlers = [
  http.get('/api/health', () => {
    return HttpResponse.json({ status: 'ok' })
  }),
  ...authHandlers,
  ...projectHandlers,
]
