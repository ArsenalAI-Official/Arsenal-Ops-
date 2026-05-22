import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

describe('smoke tests', () => {
  it('basic sanity check', () => {
    expect(true).toBe(true);
  });

  it('renders text with react testing library', () => {
    render(<div>hello</div>);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('fetches api health endpoint', async () => {
    const response = await fetch('/api/health');
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
  });
});
