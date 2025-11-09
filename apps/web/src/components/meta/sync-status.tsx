'use client';

import React from 'react';
import { Loader2, Wifi, WifiOff } from 'lucide-react';
import { LoadingSpinner } from '@/components/loading-states';

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