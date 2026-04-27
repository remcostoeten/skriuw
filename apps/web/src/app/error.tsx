'use client'

import { useEffect } from 'react'
import { Button } from '@/shared/components/ui/button'
import { Home, RefreshCw, AlertTriangle } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Route error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background/90 to-background flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-border/60 bg-card/90 p-8 shadow-xl backdrop-blur">
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

        {process.env.NODE_ENV === 'development' && (
          <details className="mb-6 overflow-hidden rounded-xl border border-border/50 bg-muted/40 text-left shadow-inner">
            <summary className="cursor-pointer bg-muted/60 px-4 py-3 text-sm font-medium text-foreground">
              Error details (development only)
            </summary>
            <pre className="max-h-72 overflow-auto bg-muted/20 px-4 py-4 text-xs leading-relaxed text-muted-foreground">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={reset} className="flex flex-1 items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
          <Button
            variant="secondary"
            onClick={() => (window.location.href = '/')}
            className="flex flex-1 items-center justify-center gap-2 text-foreground"
          >
            <Home className="h-4 w-4" />
            Go Home
          </Button>
        </div>
      </div>
    </div>
  )
}