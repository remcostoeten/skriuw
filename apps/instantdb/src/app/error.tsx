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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="bg-card rounded-lg shadow-sm border p-6 max-w-md w-full">
        <div className="flex items-center space-x-3 mb-4">
          <div className="bg-destructive/10 rounded-full p-2">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
        </div>

        <p className="text-muted-foreground mb-4">
          We encountered an unexpected error. Your work has been saved, and you can try refreshing the page.
        </p>

        {process.env.NODE_ENV === 'development' && (
          <details className="mb-4 p-3 bg-muted rounded border">
            <summary className="text-sm font-medium text-foreground cursor-pointer mb-2">
              Error Details (Development Only)
            </summary>
            <pre className="text-xs text-muted-foreground overflow-auto">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={reset} className="flex items-center justify-center">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
          <Button
            variant="outline"
            onClick={() => (window.location.href = '/')}
            className="flex items-center justify-center"
          >
            <Home className="h-4 w-4 mr-2" />
            Go Home
          </Button>
        </div>
      </div>
    </div>
  )
}

