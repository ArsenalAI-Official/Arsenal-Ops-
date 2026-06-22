// In-memory project store. Typed from the generated wire type so a backend
// contract change breaks the fixture at compile time (tsconfig.test.json).
import type { ProjectDetailResponse } from '@/client';

export const PROJECT_ID = 1;

export function seedProject(): ProjectDetailResponse {
  return {
    id: PROJECT_ID,
    name: 'Test Project',
    key_prefix: 'TP',
    description: 'A seeded project for tests',
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    developers: [],
    github_repo_urls: [],
    github_repo_url: null,
    github_repo_name: null,
    category_id: null,
    category_name: null,
    work_item_stats: {
      total: 2,
      by_status: { todo: 1, in_progress: 1 },
      total_points: 0,
      completed: 0,
      completion_pct: 0,
    },
  };
}

let project: ProjectDetailResponse = seedProject();

export const projectStore = {
  get: () => project,
  set: (p: ProjectDetailResponse) => {
    project = p;
  },
};

export function resetProjectStore(): void {
  project = seedProject();
}
