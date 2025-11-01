'use client';

import React from 'react';
import { Loader2, Wifi, WifiOff, RefreshCw } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  return (
    <Loader2 className={`animate-spin ${sizeClasses[size]} ${className}`} />
  );
}

interface SyncStatusProps {
  isLoading?: boolean;
  isOnline?: boolean;
  lastSync?: Date;
  showDetails?: boolean;
}

export function SyncStatus({
  isLoading = false,
  isOnline = true,
  lastSync,
  showDetails = false
}: SyncStatusProps) {
  const formatLastSync = (date?: Date) => {
    if (!date) return 'Never';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);

    if (diffSecs < 60) return 'Just now';
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
    if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex items-center space-x-2 text-sm text-muted-foreground">
      {isLoading ? (
        <>
          <LoadingSpinner size="sm" />
          <span>Syncing...</span>
        </>
      ) : (
        <>
          {isOnline ? (
            <Wifi className="h-4 w-4 text-green-500" />
          ) : (
            <WifiOff className="h-4 w-4 text-red-500" />
          )}
          <span className={isOnline ? 'text-green-600' : 'text-red-600'}>
            {isOnline ? 'Connected' : 'Offline'}
          </span>
        </>
      )}

      {showDetails && lastSync && (
        <span className="text-xs text-muted-foreground">
          Last sync: {formatLastSync(lastSync)}
        </span>
      )}
    </div>
  );
}

interface SyncingOverlayProps {
  isLoading: boolean;
  message?: string;
  children: React.ReactNode;
}

export function SyncingOverlay({ isLoading, message = 'Syncing...', children }: SyncingOverlayProps) {
  return (
    <div className="relative">
      {children}
      {isLoading && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg">
          <div className="flex flex-col items-center space-y-2">
            <LoadingSpinner size="lg" />
            <p className="text-sm text-foreground font-medium">{message}</p>
          </div>
        </div>
      )}
    </div>
  );
}

interface LoadingSkeletonProps {
  lines?: number;
  className?: string;
}

export function LoadingSkeleton({ lines = 3, className = '' }: LoadingSkeletonProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-muted rounded animate-pulse"
          style={{ width: `${Math.random() * 40 + 60}%` }}
        />
      ))}
    </div>
  );
}

interface LoadingCardProps {
  title?: boolean;
  content?: boolean;
  className?: string;
}

export function LoadingCard({ title = true, content = true, className = '' }: LoadingCardProps) {
  return (
    <div className={`bg-card rounded-lg border p-4 space-y-3 ${className}`}>
      {title && (
        <div className="h-6 bg-muted rounded animate-pulse w-1/3" />
      )}
      {content && <LoadingSkeleton lines={3} />}
    </div>
  );
}

interface LoadingStateProps {
  isLoading: boolean;
  error?: Error | null;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  errorFallback?: React.ReactNode;
}

export function LoadingState({
  isLoading,
  error,
  children,
  fallback,
  errorFallback
}: LoadingStateProps) {
  if (error) {
    return errorFallback || (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center space-x-2">
          <RefreshCw className="h-4 w-4 text-red-500" />
          <span className="text-sm text-red-700">
            Failed to load. Please try again.
          </span>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return fallback || <LoadingCard />;
  }

  return <>{children}</>;
}