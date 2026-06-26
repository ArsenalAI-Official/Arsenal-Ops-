import { describe, it, expect } from 'vitest';
import { stripMarkdown } from './markdown';

describe('stripMarkdown', () => {
  it('returns empty string for empty/falsy input', () => {
    expect(stripMarkdown('')).toBe('');
  });

  it('strips heading hashes', () => {
    expect(stripMarkdown('# Title')).toBe('Title');
    expect(stripMarkdown('### Deep heading')).toBe('Deep heading');
  });

  it('strips bold and italic markers', () => {
    expect(stripMarkdown('**bold** and _italic_ and *em*')).toBe('bold and italic and em');
  });

  it('handles multiple emphasis spans on one line', () => {
    expect(stripMarkdown('**a** and **b**')).toBe('a and b');
  });

  it('unwraps nested emphasis without leaving a stray marker', () => {
    expect(stripMarkdown('***both***')).toBe('both');
  });

  it('preserves intra-word underscores (snake_case identifiers)', () => {
    expect(stripMarkdown('set user_name and file_path')).toBe('set user_name and file_path');
    expect(stripMarkdown('a_b_c_d_e')).toBe('a_b_c_d_e');
  });

  it('leaves unmatched/lone markers intact', () => {
    expect(stripMarkdown('compute 2 * 3 = 6')).toBe('compute 2 * 3 = 6');
    expect(stripMarkdown('a * b')).toBe('a * b');
  });

  it('strips inline code backticks', () => {
    expect(stripMarkdown('use `apiFetch` here')).toBe('use apiFetch here');
  });

  it('reduces links to their text', () => {
    expect(stripMarkdown('see [the docs](https://example.com)')).toBe('see the docs');
  });

  it('reduces images to their alt text', () => {
    expect(stripMarkdown('![diagram](/img.png) shown')).toBe('diagram shown');
  });

  it('strips list markers and collapses lines to spaces', () => {
    expect(stripMarkdown('- one\n- two\n- three')).toBe('one two three');
    expect(stripMarkdown('1. first\n2. second')).toBe('first second');
  });

  it('strips blockquotes and strikethrough', () => {
    expect(stripMarkdown('> quoted ~~gone~~ text')).toBe('quoted gone text');
  });

  it('keeps fenced code block contents without the fences', () => {
    expect(stripMarkdown('```ts\nconst x = 1;\n```')).toBe('const x = 1;');
  });

  it('collapses redundant whitespace', () => {
    expect(stripMarkdown('a   b\n\n\nc')).toBe('a b c');
  });
});
