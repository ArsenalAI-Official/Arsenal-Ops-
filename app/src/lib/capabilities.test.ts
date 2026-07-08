// Unit tests (type U — no render) for matchesCapability, which mirrors the
// backend's capability-matching semantics (backend/capabilities.py::matches).
// A grant covers a needed key when it is the "*" wildcard, an exact match, or a
// ".*" prefix that covers the bare prefix key and any dotted descendant.
//
// We test ONLY the behavior the code actually implements — no invented rules
// (e.g. there is no case-insensitive matching, no implicit hierarchy without a
// ".*" suffix).
import { describe, expect, it } from 'vitest';
import { matchesCapability } from './capabilities';

describe('matchesCapability', () => {
  describe('exact match', () => {
    it('matches an exact grant', () => {
      expect(matchesCapability('projects.view', ['projects.view'])).toBe(true);
    });

    it('matches when the exact grant is among several', () => {
      expect(
        matchesCapability('workitems.edit', ['projects.view', 'workitems.edit', 'admin.view']),
      ).toBe(true);
    });

    it('does not match a different key', () => {
      expect(matchesCapability('projects.edit', ['projects.view'])).toBe(false);
    });

    it('does not treat a bare prefix (without .*) as covering children', () => {
      // "projects" is NOT "projects.*", so it only matches the literal "projects".
      expect(matchesCapability('projects.view', ['projects'])).toBe(false);
    });

    it('matches a bare key against its own exact grant', () => {
      expect(matchesCapability('projects', ['projects'])).toBe(true);
    });
  });

  describe('"*" global wildcard (superuser bypass)', () => {
    it('grants any capability', () => {
      expect(matchesCapability('anything.at.all', ['*'])).toBe(true);
    });

    it('grants a bare key', () => {
      expect(matchesCapability('admin', ['*'])).toBe(true);
    });

    it('grants even an empty needed string', () => {
      expect(matchesCapability('', ['*'])).toBe(true);
    });
  });

  describe('".*" prefix wildcard', () => {
    it('covers a direct child', () => {
      expect(matchesCapability('project.foo', ['project.*'])).toBe(true);
    });

    it('covers a deeply nested descendant', () => {
      expect(matchesCapability('project.foo.bar', ['project.*'])).toBe(true);
    });

    it('covers the bare prefix key itself', () => {
      // grant "project.*" → prefix "project" → needed === prefix is a match.
      expect(matchesCapability('project', ['project.*'])).toBe(true);
    });

    it('does not cover a sibling prefix that only shares a leading substring', () => {
      // "project.*" → prefix "project"; "projects" does not === "project" nor
      // startsWith "project." — the dot boundary is required.
      expect(matchesCapability('projects', ['project.*'])).toBe(false);
    });

    it('does not cross the dot boundary loosely', () => {
      expect(matchesCapability('projectxfoo', ['project.*'])).toBe(false);
    });

    it('does not match an unrelated key', () => {
      expect(matchesCapability('admin.view', ['project.*'])).toBe(false);
    });
  });

  describe('empty grants', () => {
    it('returns false for an empty grant list', () => {
      expect(matchesCapability('projects.view', [])).toBe(false);
    });
  });

  describe('case sensitivity', () => {
    it('is case-sensitive on exact match', () => {
      expect(matchesCapability('Projects.View', ['projects.view'])).toBe(false);
    });

    it('is case-sensitive on prefix match', () => {
      expect(matchesCapability('PROJECT.foo', ['project.*'])).toBe(false);
    });
  });

  describe('multiple grants', () => {
    it('matches if any grant in the list covers the need (short-circuits)', () => {
      expect(
        matchesCapability('project.foo.bar', ['admin.view', 'workitems.edit', 'project.*']),
      ).toBe(true);
    });

    it('returns false when no grant covers the need', () => {
      expect(matchesCapability('billing.export', ['admin.view', 'project.*'])).toBe(false);
    });
  });
});
