// Guard against the classic cross-test-leak bug: a store mutated in one test
// must not bleed into the next. Mutates every store, then asserts resetMockData
// (the afterEach seam) returns each to its seed. When you add a new store,
// extend this test alongside its resetXStore().
import { describe, expect, it } from 'vitest';
import { resetMockData } from './data';
import { authStore, seedCapabilities } from './data/auth';
import { projectStore, seedProject } from './data/projects';
import { seedBoardItems, workItemStore } from './data/workitems';

describe('mock store reset', () => {
  it('resetMockData() restores every store to its seed', () => {
    authStore.setCapabilities(['mutated.cap']);
    projectStore.set({ ...seedProject(), name: 'Mutated' });
    workItemStore.set([]);

    expect(authStore.getCapabilities()).toEqual(['mutated.cap']);
    expect(projectStore.get().name).toBe('Mutated');
    expect(workItemStore.board()).toHaveLength(0);

    resetMockData();

    expect(authStore.getCapabilities()).toEqual(seedCapabilities());
    expect(projectStore.get().name).toBe(seedProject().name);
    expect(workItemStore.board()).toHaveLength(seedBoardItems().length);
  });
});
