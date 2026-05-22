import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { MemoryRouter, MemoryRouterProps } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  routerProps?: Omit<MemoryRouterProps, 'children'>;
  initialPath?: string;
}

export function renderWithProviders(
  ui: ReactElement,
  { routerProps = {}, initialPath, ...renderOptions }: RenderWithProvidersOptions = {},
) {
  // Create a queryClient with error handler disabled for test isolation
  // Tests can mock errors without triggering global toast handlers
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  queryClient.clear();

  const finalRouterProps: Omit<MemoryRouterProps, 'children'> = initialPath
    ? { initialEntries: [initialPath], ...routerProps }
    : routerProps;

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter {...finalRouterProps}>
          <AuthProvider>{children as ReactElement}</AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

// eslint-disable-next-line react-refresh/only-export-components
export * from '@testing-library/react';
