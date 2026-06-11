import { describe, it, expect } from 'vitest';
import { toPascalCase, getInitials } from './stringUtils';

describe('toPascalCase', () => {
  it('converts snake_case to PascalCase', () => {
    expect(toPascalCase('admin_user')).toBe('AdminUser');
    expect(toPascalCase('project_members_write')).toBe('ProjectMembersWrite');
  });

  it('lowercases the tail of each segment', () => {
    expect(toPascalCase('USER')).toBe('User');
  });

  it('handles single words and empty strings', () => {
    expect(toPascalCase('admin')).toBe('Admin');
    expect(toPascalCase('')).toBe('');
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
