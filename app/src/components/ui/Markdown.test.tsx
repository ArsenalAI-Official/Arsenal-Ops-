import { describe, it, expect } from 'vitest';
import { renderPlain } from '@/test-utils/render';
import { Markdown } from './Markdown';

describe('Markdown', () => {
  it('renders a single newline as a line break (remark-breaks)', () => {
    // CommonMark would collapse a lone "\n" to a space; remark-breaks keeps it
    // as a <br>, preserving structure in plain-text descriptions.
    const { container } = renderPlain(<Markdown>{'Step 1\nStep 2\nStep 3'}</Markdown>);
    expect(container.querySelectorAll('br').length).toBe(2);
  });

  it('opens links in a new tab with a hardened rel', () => {
    const { getByRole } = renderPlain(<Markdown>{'see [docs](https://example.com)'}</Markdown>);
    const link = getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders raw HTML as inert text (no XSS surface)', () => {
    const { container } = renderPlain(<Markdown>{'<img src=x onerror=alert(1)>'}</Markdown>);
    expect(container.querySelector('img')).toBeNull();
  });
});
