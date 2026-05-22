import { Component, ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export class RouteErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state = { error: undefined as Error | undefined };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('RouteErrorBoundary caught', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="min-h-screen bg-[#080808] flex items-center justify-center">
          <div className="p-8 text-center max-w-md">
            <h2 className="text-xl font-semibold text-white mb-2">Something went wrong</h2>
            <p className="text-muted-foreground text-[#a3a3a3] mb-4">
              We encountered an unexpected error. Please try refreshing the page.
            </p>
            <Button
              onClick={() => window.location.reload()}
              className="bg-gradient-to-r from-[#E0B954] to-[#C79E3B] hover:opacity-90 text-[#080808] rounded-lg font-medium"
            >
              Reload Page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
