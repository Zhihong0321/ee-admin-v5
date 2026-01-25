/**
 * ============================================================================
 * SYNC PROGRESS TRACKING HOOK
 * ============================================================================
 *
 * Custom hook for tracking sync operation progress via SSE (Server-Sent Events).
 * Handles connection, message parsing, and cleanup.
 *
 * File: src/app/sync/hooks/useSyncProgress.ts
 */

import { useEffect, useRef, useState } from "react";

interface SyncProgress {
  status: 'running' | 'completed' | 'error';
  category?: string;
  details?: string[];
  current?: number;
  total?: number;
  percentage?: number;
}

interface UseSyncProgressOptions {
  sessionId: string | null;
  endpoint: 'files-progress' | 'progress';
}

interface UseSyncProgressReturn {
  progress: SyncProgress | null;
  isConnected: boolean;
}

/**
 * Hook for tracking sync progress via SSE
 */
export function useSyncProgress({ sessionId, endpoint }: UseSyncProgressOptions): UseSyncProgressReturn {
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setIsConnected(false);
      return;
    }

    const url = `/api/sync/${endpoint}?sessionId=${sessionId}`;
    console.log(`[useSyncProgress] Connecting to: ${url}`);
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log(`[useSyncProgress] Connection opened for ${endpoint}`);
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log(`[useSyncProgress] Message received:`, data);
      setProgress(data);

      // Auto-close on completion or error
      if (data.status === 'completed' || data.status === 'error') {
        setTimeout(() => {
          eventSource.close();
          setIsConnected(false);
        }, 1000);
      }
    };

    eventSource.onerror = (error) => {
      console.error(`[useSyncProgress] Connection error:`, error);
      setIsConnected(false);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [sessionId, endpoint]);

  return { progress, isConnected };
}

/**
 * Hook for polling sync progress (fallback for operations that don't use SSE)
 */
interface UsePollProgressOptions {
  sessionId: string | null;
  enabled: boolean;
  pollInterval?: number; // milliseconds
}

interface UsePollProgressReturn {
  progress: SyncProgress | null;
  isPolling: boolean;
}

export function usePollProgress({ sessionId, enabled, pollInterval = 2000 }: UsePollProgressOptions): UsePollProgressReturn {
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [isPolling, setIsPolling] = useState(enabled);

  useEffect(() => {
    if (!sessionId || !enabled) {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);
    console.log(`[usePollProgress] Polling for progress, sessionId: ${sessionId}`);

    const pollProgress = async () => {
      try {
        const res = await fetch(`/api/sync/progress?sessionId=${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.progress) {
            console.log(`[usePollProgress] Progress update:`, data.progress);
            setProgress(data.progress);

            // Stop polling if completed or error
            if (data.progress.status === 'completed' || data.progress.status === 'error') {
              setIsPolling(false);
            }
          }
        }
      } catch (error) {
        console.error(`[usePollProgress] Failed to fetch progress:`, error);
      }
    };

    // Initial poll
    pollProgress();

    // Set up interval
    const interval = setInterval(pollProgress, pollInterval);

    return () => clearInterval(interval);
  }, [sessionId, enabled, pollInterval]);

  return { progress, isPolling };
}
