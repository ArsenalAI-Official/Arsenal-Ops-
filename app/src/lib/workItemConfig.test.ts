import { describe, it, expect } from 'vitest';
import {
  getStatusColor,
  getStatusLabel,
  getPriorityColor,
  STATUS_CONFIG,
  PRIORITY_COLOR,
} from './workItemConfig';

describe('getStatusColor', () => {
  it('returns the canonical color for known statuses', () => {
    expect(getStatusColor('done')).toBe('#34D399');
    expect(getStatusColor('in_progress')).toBe('#E0B954');
  });

  it('falls back to the backlog color for unknown statuses', () => {
    expect(getStatusColor('nonsense')).toBe(STATUS_CONFIG.backlog.color);
  });
});

describe('getStatusLabel', () => {
  it('returns the human label for known statuses', () => {
    expect(getStatusLabel('in_review')).toBe('In Review');
  });

  it('falls back to the raw key for unknown statuses', () => {
    expect(getStatusLabel('weird_state')).toBe('weird_state');
  });
});

describe('getPriorityColor', () => {
  it('returns the canonical color for known priorities', () => {
    expect(getPriorityColor('critical')).toBe('#EF4444');
    expect(getPriorityColor('high')).toBe('#F97316');
  });

  it('falls back to the low/grey color for unknown priorities', () => {
    expect(getPriorityColor('nonsense')).toBe(PRIORITY_COLOR.low);
  });
});
