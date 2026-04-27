import type { Metadata } from 'next';
import { Button } from '@/shared/components/ui/button';
import { Home, RefreshCw, AlertTriangle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Error - Something went wrong',
};

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error('Route error:', error);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-full bg-destructive/15 p-3">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              We ran into an unexpected error. Your work was saved, so feel free to refresh or head back home.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={reset} className="flex flex-1 items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
          <Button
            variant="secondary"
            onClick={() => (window.location.href = '/')}
            className="flex flex-1 items-center justify-center gap-2"
          >
            <Home className="h-4 w-4" />
            Go Home
          </Button>
        </div>
      </div>
    </main>
  );
}