import type { ProjectDeveloperEntry } from '@/client';

// Canonical work-item type now lives in `@/types/workItems` (audit F-T1). This
// re-export keeps existing `@/components/WorkItemPanel` importers working; the
// canonical shape is a superset (it additionally carries `completed_at`).
export type { WorkItem } from '@/types/workItems';

// Sourced from the backend's `DeveloperResponse` schema (generated from
// `GET /api/developers/`). The generated shape is a superset of what consumers
// read here (id/name/email) — it also carries avatar_url/github_username/created_at.
export type { DeveloperResponse as AllDeveloper } from '@/client';

export interface ProjectLite {
  developers?: ProjectDeveloperEntry[];
}
