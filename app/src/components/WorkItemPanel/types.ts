import type { ProjectDeveloperEntry } from '@/client';

// Canonical work-item type now lives in `@/types/workItems` (audit F-T1). This
// re-export keeps existing `@/components/WorkItemPanel` importers working; the
// canonical shape is a superset (it additionally carries `completed_at`).
export type { WorkItem } from '@/types/workItems';

export interface ProjectLite {
  developers?: ProjectDeveloperEntry[];
}
