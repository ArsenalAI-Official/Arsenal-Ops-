import { describe, it, expect } from 'vitest';
import { formatRoleName, getInitials } from './stringUtils';

describe('formatRoleName', () => {
  it('converts snake_case to Title Case with spaces', () => {
    expect(formatRoleName('project_manager')).toBe('Project Manager');
    expect(formatRoleName('external_users')).toBe('External Users');
  });

  it('capitalizes single words', () => {
    expect(formatRoleName('admin')).toBe('Admin');
    expect(formatRoleName('developer')).toBe('Developer');
  });

  it('preserves existing casing in the tail (acronyms survive)', () => {
    expect(formatRoleName('QA')).toBe('QA');
    expect(formatRoleName('qa_lead')).toBe('Qa Lead');
  });

  it('handles empty strings', () => {
    expect(formatRoleName('')).toBe('');
  });
});

describe('getInitials', () => {
  it('returns up to two uppercase initials', () => {
    expect(getInitials('Jane Doe')).toBe('JD');
    expect(getInitials('mary jane watson')).toBe('MJ');
  });

  it('handles a single name', () => {
    expect(getInitials('Cher')).toBe('C');
  });

  it('collapses leading/trailing/repeated whitespace', () => {
    expect(getInitials('  jane   doe  ')).toBe('JD');
  });

  it('returns empty string for empty / whitespace-only input', () => {
    expect(getInitials('')).toBe('');
    expect(getInitials('   ')).toBe('');
  });
});
