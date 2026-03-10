import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  retryKey: number;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    retryKey: 0,
  };

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Error boundary caught an error', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState((current) => ({
      hasError: false,
      retryKey: current.retryKey + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <section className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-10">
          <Card className="w-full">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center gap-3">
                <AlertTriangle aria-hidden="true" className="size-5 text-destructive" />
                <h1 className="text-xl font-semibold">Something went wrong</h1>
              </div>
              <p className="text-sm text-muted">
                We hit an unexpected problem while rendering this page.
              </p>
              <Button onClick={this.handleRetry} type="button">
                Retry
              </Button>
            </CardContent>
          </Card>
        </section>
      );
    }

    return <div key={this.state.retryKey}>{this.props.children}</div>;
  }
}
