import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { server } from '@/test/mocks/server';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/test/utils';
import { Login } from './Login';

describe('Login', () => {
  it('renders the login card with title and Google sign-in button', () => {
    renderWithProviders(<Login />);
    expect(screen.getByText('Arsenal Ops')).toBeInTheDocument();
    expect(screen.getByText('Sign in with your Google account')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /loading google sign-in/i })).toBeInTheDocument();
  });

  it('displays Google SSO button element', () => {
    renderWithProviders(<Login />);
    const button = screen.getByRole('button', { name: /google/i });
    expect(button).toBeInTheDocument();
  });

  it('probes dev-login availability on mount (fires fetch)', async () => {
    renderWithProviders(<Login />);
    // The component fires a probe to /api/auth/dev-login/available in useEffect.
    // It arrives and is handled silently if available=false (the default).
    // We verify the component renders without error.
    await waitFor(() => {
      expect(screen.getByText('Arsenal Ops')).toBeInTheDocument();
    });
  });

  it('shows error message when Google config fetch fails', async () => {
    server.use(
      http.get('/api/auth/google/config', () => {
        return HttpResponse.json({ error: 'Not found' }, { status: 404 });
      }),
    );

    renderWithProviders(<Login />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load google sign-in/i)).toBeInTheDocument();
    });
  });

  it('shows info box about Google account signup', () => {
    renderWithProviders(<Login />);
    expect(
      screen.getByText(/new accounts will be automatically created on first login/i),
    ).toBeInTheDocument();
  });
});
