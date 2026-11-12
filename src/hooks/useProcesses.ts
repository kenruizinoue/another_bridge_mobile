import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchProcesses, stopProcess, type ProcessList } from '../api/processes';

export const PROCESS_POLL_MS = 3000;

// The Processes view's data: refreshed every few seconds while open, with
// a manual refresh and stop. Errors keep the last list on screen.
export default function useProcesses(active = true) {
  const [data, setData] = useState<ProcessList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [stopping, setStopping] = useState<number | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const next = await fetchProcesses();
      if (!mounted.current) return;
      setData(next);
      setError(null);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    void load();
    const timer = setInterval(() => void load(), PROCESS_POLL_MS);
    return () => clearInterval(timer);
  }, [active, load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, [load]);

  const stop = useCallback(
    async (pid: number) => {
      setStopping(pid);
      try {
        await stopProcess(pid);
      } catch (e) {
        if (mounted.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (mounted.current) setStopping(null);
        await load();
      }
    },
    [load],
  );

  return { data, error, refreshing, stopping, refresh, stop };
}
