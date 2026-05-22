import { http, HttpResponse } from 'msw';

export const authHandlers = [
  http.get('/api/auth/me', () => {
    return HttpResponse.json({
      id: 1,
      email: 'user@example.com',
      name: 'Test User',
      role: 'developer',
      is_first_login: false,
    });
  }),

  http.get('/api/auth/me/capabilities', () => {
    return HttpResponse.json({
      capabilities: [],
    });
  }),
];

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
    ]);
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
    ]);
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
    ]);
  }),
];

export const projectBoardHandlers = [
  http.get('/api/projects/:projectId', () => {
    return HttpResponse.json({
      id: 1,
      name: 'Test Project',
      description: 'Test project for board',
      key_prefix: 'TEST',
      status: 'active',
      created_at: '2026-01-01T00:00:00',
      work_item_stats: {
        total: 3,
        by_status: { todo: 1, in_progress: 1, done: 1 },
        total_points: 13,
        completed: 1,
        completion_pct: 33,
      },
      developers: [
        { id: 1, name: 'Alice', email: 'alice@example.com', role: 'developer' },
        { id: 2, name: 'Bob', email: 'bob@example.com', role: 'developer' },
      ],
    });
  }),

  http.get('/api/workitems/board', () => {
    return HttpResponse.json([
      {
        id: '1',
        key: 'TEST-1',
        type: 'user_story',
        title: 'First Story',
        description: 'First story description',
        status: 'todo',
        assigned_hours: 16,
        remaining_hours: 16,
        logged_hours: 0,
        story_points: 4,
        priority: 'high',
        assignee: 'Alice',
        assignee_id: 1,
        sprint: 'Sprint 1',
        sprint_id: 1,
        product_id: '1',
        tags: ['backend'],
        epic: '',
      },
      {
        id: '2',
        key: 'TEST-2',
        type: 'task',
        title: 'Second Task',
        description: 'Second task description',
        status: 'in_progress',
        assigned_hours: 8,
        remaining_hours: 4,
        logged_hours: 4,
        story_points: 0,
        priority: 'medium',
        assignee: 'Bob',
        assignee_id: 2,
        sprint: 'Sprint 1',
        sprint_id: 1,
        product_id: '1',
        tags: ['frontend'],
        epic: '',
      },
      {
        id: '3',
        key: 'TEST-3',
        type: 'bug',
        title: 'Third Bug',
        description: 'Third bug description',
        status: 'done',
        assigned_hours: 4,
        remaining_hours: 0,
        logged_hours: 4,
        story_points: 0,
        priority: 'critical',
        assignee: '',
        assignee_id: null,
        sprint: 'Sprint 2',
        sprint_id: 2,
        product_id: '1',
        tags: [],
        epic: '',
      },
    ]);
  }),

  http.get('/api/workitems/projects/:projectId/sprints', () => {
    return HttpResponse.json([
      {
        id: 1,
        name: 'Sprint 1',
        goal: 'Initial sprint',
        status: 'active',
        start_date: '2026-05-01',
        end_date: '2026-05-15',
        capacity_hours: 40,
        velocity: 8,
        total_items: 2,
        todo_count: 1,
        in_progress_count: 1,
        done_count: 0,
        total_points: 4,
        completed_points: 0,
        completion_pct: 0,
      },
      {
        id: 2,
        name: 'Sprint 2',
        goal: 'Second sprint',
        status: 'upcoming',
        start_date: '2026-05-16',
        end_date: '2026-05-31',
        capacity_hours: 40,
        velocity: 0,
        total_items: 1,
        todo_count: 0,
        in_progress_count: 0,
        done_count: 1,
        total_points: 0,
        completed_points: 0,
        completion_pct: 100,
      },
    ]);
  }),

  http.get('/api/developers/', () => {
    return HttpResponse.json([
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' },
    ]);
  }),
];

export const adminHandlers = [
  http.get('/api/admin/stats', () => {
    return HttpResponse.json({
      total_employees: 5,
      total_projects: 3,
      total_tickets: 42,
      active_sprints: 2,
      tickets_by_status: { todo: 20, in_progress: 15, done: 7 },
      tickets_by_priority: { high: 10, medium: 20, low: 12 },
    });
  }),

  http.get('/api/admin/employees', () => {
    return HttpResponse.json([]);
  }),

  http.get('/api/admin/developers/capacity', () => {
    return HttpResponse.json([]);
  }),

  http.get('/api/admin/projects', () => {
    return HttpResponse.json([]);
  }),

  http.get('/api/auth/admin/users', () => {
    return HttpResponse.json([]);
  }),

  http.get('/api/auth/admin/roles', () => {
    return HttpResponse.json([]);
  }),

  http.get('/api/auth/capabilities', () => {
    return HttpResponse.json([]);
  }),
];

export const itemDetailDrawerHandlers = [
  http.get('/api/workitems/:itemId', () => {
    return HttpResponse.json({
      id: '1',
      key: 'TEST-1',
      type: 'user_story',
      title: 'First Story',
      description: 'First story description',
      status: 'todo',
      assigned_hours: 16,
      remaining_hours: 16,
      logged_hours: 0,
      story_points: 4,
      priority: 'high',
      assignee: 'Alice',
      assignee_id: 1,
      sprint: 'Sprint 1',
      sprint_id: 1,
      product_id: '1',
      tags: ['backend'],
      epic: '',
    });
  }),

  http.get('/api/workitems/:itemId/time-entries', () => {
    return HttpResponse.json([]);
  }),

  http.get('/api/comments/workitem/:itemId', () => {
    return HttpResponse.json([]);
  }),

  http.post('/api/comments', () => {
    return HttpResponse.json({ id: 3, success: true });
  }),

  http.patch('/api/workitems/:itemId', () => {
    return HttpResponse.json({ success: true });
  }),
];

export const personalTasksHandlers = [
  http.post('/api/personal-tasks/', () => {
    return HttpResponse.json({
      id: 3,
      title: 'New Task',
      description: '',
      priority: 'medium',
      status: 'todo',
      due_date: undefined,
      estimated_hours: 0,
      is_converted: false,
      created_at: '2026-05-22T00:00:00',
      tags: [],
    });
  }),

  http.put('/api/personal-tasks/:id', () => {
    return HttpResponse.json({
      id: 1,
      title: 'Updated Task',
      description: '',
      priority: 'high',
      status: 'done',
      due_date: '2026-06-01',
      estimated_hours: 4,
      is_converted: false,
      created_at: '2026-05-22T00:00:00',
      tags: [],
    });
  }),

  http.delete('/api/personal-tasks/:id', () => {
    return HttpResponse.json({ status: 'deleted' });
  }),

  http.post('/api/personal-tasks/:id/convert-to-ticket', () => {
    return HttpResponse.json({
      work_item: {
        key: 'PA-1',
        assignee_name: 'Alice',
      },
    });
  }),
];

export const projectDetailHandlers = [
  http.get('/api/projects/:id/overview', () => {
    return HttpResponse.json({
      project: {
        id: 1,
        name: 'Test Project',
        description: 'Test project for detail page',
        key_prefix: 'TEST',
        status: 'active',
        created_at: '2026-01-01T00:00:00',
        github_repo_url: 'https://github.com/example/test',
        developers: [
          {
            id: 1,
            name: 'Alice',
            email: 'alice@example.com',
            role: 'lead',
            responsibilities: 'Backend',
            is_admin: true,
            github_username: 'alice',
          },
          {
            id: 2,
            name: 'Bob',
            email: 'bob@example.com',
            role: 'developer',
            responsibilities: 'Frontend',
            is_admin: false,
            github_username: 'bob',
          },
        ],
        architectures: [],
        selected_architecture: null,
      },
      sprints: [
        {
          id: 1,
          name: 'Sprint 1',
          goal: 'Initial sprint',
          status: 'active',
          start_date: '2026-05-01',
          end_date: '2026-05-15',
          capacity_hours: 40,
          velocity: 8,
          total_items: 2,
          todo_count: 1,
          in_progress_count: 1,
          done_count: 0,
          total_points: 4,
          completed_points: 0,
          completion_pct: 0,
        },
      ],
      goals: [],
      milestones: [],
      activities: [],
      analytics: {
        total_items: 2,
        total_story_points: 4,
        completed_points: 0,
        status_distribution: { todo: 1, in_progress: 1, done: 0 },
        type_distribution: { user_story: 1, task: 1 },
        priority_distribution: { high: 1, medium: 1 },
        velocity_data: [],
        burndown_data: [],
        team_performance: [],
      },
      prdAnalysis: null,
      links: [],
    });
  }),

  http.get('/api/projects/:id', () => {
    return HttpResponse.json({
      id: 1,
      name: 'Test Project',
      description: 'Test project for detail page',
      key_prefix: 'TEST',
      status: 'active',
      created_at: '2026-01-01T00:00:00',
      github_repo_url: 'https://github.com/example/test',
      developers: [
        {
          id: 1,
          name: 'Alice',
          email: 'alice@example.com',
          role: 'lead',
          responsibilities: 'Backend',
          is_admin: true,
          github_username: 'alice',
        },
        {
          id: 2,
          name: 'Bob',
          email: 'bob@example.com',
          role: 'developer',
          responsibilities: 'Frontend',
          is_admin: false,
          github_username: 'bob',
        },
      ],
      architectures: [],
      selected_architecture: null,
    });
  }),

  http.get('/api/developers/', () => {
    return HttpResponse.json([
      { id: 1, name: 'Alice', email: 'alice@example.com', github_username: 'alice' },
      { id: 2, name: 'Bob', email: 'bob@example.com', github_username: 'bob' },
      { id: 3, name: 'Charlie', email: 'charlie@example.com', github_username: 'charlie' },
    ]);
  }),

  http.get('/api/workitems/', () => {
    return HttpResponse.json([]);
  }),

  http.get('/api/projects/:id/goals', () => {
    return HttpResponse.json([]);
  }),

  http.get('/api/projects/:id/milestones', () => {
    return HttpResponse.json([]);
  }),

  http.get('/api/projects/:id/activity', () => {
    return HttpResponse.json([]);
  }),

  http.get('/api/workitems/projects/:projectId/analytics', () => {
    return HttpResponse.json({
      total_items: 2,
      total_story_points: 4,
      completed_points: 0,
      status_distribution: { todo: 1, in_progress: 1, done: 0 },
      type_distribution: { user_story: 1, task: 1 },
      priority_distribution: { high: 1, medium: 1 },
      velocity_data: [],
      burndown_data: [],
      team_performance: [],
    });
  }),

  http.get('/api/prd/projects/:projectId/analysis', () => {
    return HttpResponse.json(null);
  }),

  http.get('/api/projects/:id/links', () => {
    return HttpResponse.json([]);
  }),
];

export const pulseTabHandlers = [
  http.get('/api/projects/:projectId/pulse', () => {
    return HttpResponse.json({
      project: {
        name: 'Test Project',
        keyPrefix: 'TEST',
        contractStart: '2026-01-01',
        launchTarget: '2026-06-15',
        contractEnd: '2026-12-31',
      },
      ledger: [
        { category: 'Dev', amount: 50000, owner: 'AAI' },
        { category: 'Management', amount: 25000, owner: 'AAI' },
      ],
      months: [
        {
          m: 'Jan 2026',
          devFC: 160,
          devAct: 155,
          dev: 12400,
          ad: 2000,
          gtm: 3000,
          ba: 1500,
          mgmt: 4100,
          actual: true,
        },
        {
          m: 'Feb 2026',
          devFC: 160,
          devAct: 162,
          dev: 12800,
          ad: 2100,
          gtm: 3200,
          ba: 1600,
          mgmt: 4200,
          actual: true,
          partial: false,
        },
      ],
      lastActualIdx: 1,
      currentMonthTrackedPct: 45,
      includedServices: [
        {
          month: 'Feb 2026',
          totalHours: 400,
          usedHours: 320,
          billableAccrued: 20,
          billableAccruedCost: 3000,
          billableInvoiced: 10,
          invoiceCount: 1,
          expectedRemaining: 150,
        },
      ],
      summary: {
        healthScore: 85,
        healthStatus: 'Healthy',
        deliveryPct: 42,
        deliveryCompleted: 5,
        deliveryTotal: 12,
        overdueCount: 0,
        openBugs: 2,
        criticalOpen: 0,
        overallCompletion: 42,
        workItems: 12,
        pointsCompleted: 5,
        pointsTotal: 12,
        activeSprints: 1,
        monthLabel: 'Feb 2026',
        monthIndex: 1,
        totalMonths: 12,
        narrative: 'Project is on track with healthy burn rate.',
        risksTrendNote: 'All clear',
        peopleTrendNote: '6 active contributors',
      },
      risks: [
        {
          severity: 'low',
          title: 'Resource availability',
          owner: 'PM',
          due: '2026-06-01',
        },
      ],
      milestones: [
        {
          id: 'ms1',
          phase: 'MVP',
          date: '2026-06-15',
          status: 'in-progress',
          budget: 50000,
          spent: 25000,
          pct: 50,
        },
      ],
      updates: [
        {
          when: '2026-05-20',
          author: 'PM',
          type: 'milestone',
          text: 'MVP feature complete',
        },
      ],
      forecastVsActuals: {
        current: [
          { feature: 'Auth', employee: 'Alice', fc: 20, act: 18 },
          { feature: 'API', employee: 'Bob', fc: 30, act: 32 },
        ],
        last: [{ feature: 'Auth', employee: 'Alice', fc: 20, act: 20 }],
        project: [
          { feature: 'Auth', employee: 'Alice', fc: 40, act: 38 },
          { feature: 'API', employee: 'Bob', fc: 60, act: 64 },
        ],
      },
    });
  }),
];

export const createItemModalHandlers = [
  http.post('/api/workitems/', () => {
    return HttpResponse.json({
      id: '99',
      key: 'TEST-99',
      type: 'user_story',
      title: 'New Item',
      description: '',
      status: 'todo',
      assigned_hours: 16,
      remaining_hours: 16,
      logged_hours: 0,
      story_points: 4,
      priority: 'medium',
      assignee: '',
      assignee_id: null,
      sprint: 'Backlog',
      sprint_id: null,
      product_id: '1',
      tags: [],
      epic: '',
    });
  }),
];

export const handlers = [
  http.get('/api/health', () => {
    return HttpResponse.json({ status: 'ok' });
  }),
  ...authHandlers,
  ...projectHandlers,
  ...projectDetailHandlers,
  ...projectBoardHandlers,
  ...itemDetailDrawerHandlers,
  ...adminHandlers,
  ...createItemModalHandlers,
  ...personalTasksHandlers,
  ...pulseTabHandlers,
];
