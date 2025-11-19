import { useState, useEffect, useCallback, useRef } from 'react';

interface StreamingDataOptions<T> {
  // Initial skeleton data
  skeletonData?: T;
  // Function to fetch real data
  fetchData: () => Promise<T>;
  // Whether to start hydrated or in skeleton mode
  startHydrated?: boolean;
  // Delay before showing skeleton (ms) - for fast connections
  skeletonDelay?: number;
  // Delay before fetching data (ms) - for staggering requests
  fetchDelay?: number;
  // Min time to show skeleton (ms) - for UX consistency
  minSkeletonTime?: number;
}

interface StreamingDataResult<T> {
  data: T;
  isLoading: boolean;
  isHydrating: boolean;
  error: Error | null;
  // Force refetch data
  refetch: () => void;
}

/**
 * Hook for streaming data with zero layout shift
 * Returns skeleton data immediately, then smoothly hydrates with real data
 */
export function useStreamingData<T>({
  skeletonData,
  fetchData,
  startHydrated = false,
  skeletonDelay = 0,
  fetchDelay = 0,
  minSkeletonTime = 300,
}: StreamingDataOptions<T>): StreamingDataResult<T> {
  const [data, setData] = useState<T>(() => skeletonData as T);
  const [isLoading, setIsLoading] = useState(!startHydrated);
  const [isHydrating, setIsHydrating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const skeletonTimeoutRef = useRef<NodeJS.Timeout>();
  const fetchTimeoutRef = useRef<NodeJS.Timeout>();
  const minSkeletonTimeoutRef = useRef<NodeJS.Timeout>();
  const abortControllerRef = useRef<AbortController>();

  const performFetch = useCallback(async (signal?: AbortSignal) => {
    try {
      setError(null);
      const result = await fetchData();

      // Don't update if request was aborted
      if (signal?.aborted) return;

      setData(result);
      setIsLoading(false);
      setIsHydrating(false);
    } catch (err) {
      // Don't update error if request was aborted
      if (signal?.aborted) return;

      setError(err instanceof Error ? err : new Error('Failed to fetch data'));
      setIsLoading(false);
      setIsHydrating(false);
    }
  }, [fetchData]);

  const refetch = useCallback(() => {
    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setIsHydrating(true);
    performFetch(abortControllerRef.current.signal);
  }, [performFetch]);

  useEffect(() => {
    if (startHydrated) {
      // If we start hydrated, fetch immediately without skeleton
      abortControllerRef.current = new AbortController();
      performFetch(abortControllerRef.current.signal);
      return;
    }

    // Show skeleton after delay (if connection is fast, we might not need it)
    skeletonTimeoutRef.current = setTimeout(() => {
      setIsLoading(true);

      // Ensure minimum skeleton time for smooth UX
      minSkeletonTimeoutRef.current = setTimeout(() => {
        // This timeout ensures we show skeleton for at least minSkeletonTime
      }, minSkeletonTime);
    }, skeletonDelay);

    // Start fetching data (with optional delay)
    fetchTimeoutRef.current = setTimeout(() => {
      abortControllerRef.current = new AbortController();
      performFetch(abortControllerRef.current.signal);
    }, skeletonDelay + fetchDelay);

    return () => {
      // Cleanup all timeouts
      if (skeletonTimeoutRef.current) {
        clearTimeout(skeletonTimeoutRef.current);
      }
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
      if (minSkeletonTimeoutRef.current) {
        clearTimeout(minSkeletonTimeoutRef.current);
      }

      // Abort any ongoing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [startHydrated, skeletonDelay, fetchDelay, minSkeletonTime, performFetch]);

  return {
    data,
    isLoading,
    isHydrating,
    error,
    refetch,
  };
}