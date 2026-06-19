// Smoke test for the test harness itself: proves MSW intercepts at the wire
// through the real apiFetch pipeline, that react-query renders the result, and
// that per-test isolation is wired. If this breaks, the foundation is broken —
// fix it before chasing individual feature-test failures.
import { describe, expect, it } from 'vitest';
import { useQuery } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { apiFetch } from '@/lib/api';
import type { UserResponse } from '@/client';
import { server } from '@/mocks/node';
import { API_BASE } from '@/mocks/handlers/constants';
import { renderWithQueryClient } from '@/test-utils/render';

describe('test harness smoke', () => {
  it('intercepts apiFetch through MSW and returns the seeded user', async () => {
    const me = await apiFetch<UserResponse>('/api/auth/me');
    expect(me.email).toBe('test@arsenalai.com');
  });

  it('maps non-2xx to ApiError via the real pipeline', async () => {
    server.use(
      http.get(`${API_BASE}/auth/me`, () => HttpResponse.json({ detail: 'boom' }, { status: 500 })),
    );
    await expect(apiFetch('/api/auth/me')).rejects.toMatchObject({ status: 500 });
  });

  it('renders a react-query consumer against the mock backend', async () => {
    function Me() {
      const { data } = useQuery({
        queryKey: ['me'],
        queryFn: () => apiFetch<UserResponse>('/api/auth/me'),
      });
      return <div>{data?.name ?? 'loading'}</div>;
    }
    renderWithQueryClient(<Me />);
    expect(await screen.findByText('Test User')).toBeInTheDocument();
  });
});
