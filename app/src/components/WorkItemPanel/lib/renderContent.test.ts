import { describe, it, expect } from 'vitest';
import { hasCompactHierarchy } from './renderContent';
import type { WorkItem } from '../types';

const wi = (p: Partial<WorkItem>): WorkItem => ({ type: 'task', ...p }) as WorkItem;

describe('hasCompactHierarchy', () => {
  it('a subtask has hierarchy iff it has a parent_key', () => {
    expect(hasCompactHierarchy(wi({ type: 'subtask', parent_key: 'AAA-1' }))).toBe(true);
    expect(hasCompactHierarchy(wi({ type: 'subtask', parent_key: null }))).toBe(false);
  });
  it('a non-subtask has hierarchy iff it has an epic_key', () => {
    expect(hasCompactHierarchy(wi({ type: 'task', epic_key: 'AAA-9' }))).toBe(true);
    expect(hasCompactHierarchy(wi({ type: 'user_story', epic_key: null }))).toBe(false);
  });
});
