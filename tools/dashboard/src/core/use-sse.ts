import { useEffect, useState, useRef } from 'react';
import type { JobEvent } from '@music-app/shared';

export function useJobSSE(jobId: string | null, onEvent?: (event: JobEvent) => void) {
  const [lastEvent, setLastEvent] = useState<JobEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    if (!jobId) return;

    let isClosed = false;
    const eventSource = new EventSource(`/api/jobs/${jobId}/events`);

    eventSource.onopen = () => {
      if (!isClosed) {
        setIsConnected(true);
      }
    };

    eventSource.onmessage = (e) => {
      if (isClosed) return;
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'connected') return;

        setLastEvent(data);
        if (onEventRef.current) {
          onEventRef.current(data);
        }

        if (
          data.status === 'completed' ||
          data.status === 'failed' ||
          data.status === 'stopped'
        ) {
          isClosed = true;
          eventSource.close();
          setIsConnected(false);
        }
      } catch (err) {
        console.error('Lỗi phân tích dữ liệu SSE:', err);
      }
    };

    eventSource.onerror = () => {
      if (!isClosed) {
        setIsConnected(false);
      }
    };

    return () => {
      isClosed = true;
      eventSource.close();
      setIsConnected(false);
    };
  }, [jobId]);

  return { lastEvent, isConnected };
}
