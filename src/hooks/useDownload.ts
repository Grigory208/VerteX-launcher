import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Client, DownloadStatus } from '@/types';

interface DownloadState {
  status: DownloadStatus;
  progress: number;
  speedMbps: number;
  downloadedMb: number;
  totalMb: number;
}

const PHASES: { status: DownloadStatus; label: string; minProgress: number; maxProgress: number }[] = [
  { status: 'downloading-core', label: 'Скачивание ядра...', minProgress: 0, maxProgress: 40 },
  { status: 'installing-mods', label: 'Установка модов...', minProgress: 40, maxProgress: 80 },
  { status: 'configuring', label: 'Настройка клиента...', minProgress: 80, maxProgress: 100 },
];

export function useDownload(
  client: Client,
  onComplete: () => void
) {
  const [state, setState] = useState<DownloadState>({
    status: 'idle',
    progress: 0,
    speedMbps: 0,
    downloadedMb: 0,
    totalMb: client.file_size_mb || 500,
  });
  const [intervalId, setIntervalId] = useState<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(() => {
    setState({
      status: 'downloading-core',
      progress: 0,
      speedMbps: 0,
      downloadedMb: 0,
      totalMb: client.file_size_mb || 500,
    });

    let currentProgress = 0;
    const id = setInterval(() => {
      const speed = 8 + Math.random() * 22;
      const increment = (speed / (client.file_size_mb || 500)) * 100 * 0.5;

      currentProgress = Math.min(currentProgress + increment, 100);

      const phase = PHASES.find((p) => currentProgress < p.maxProgress) ?? PHASES[PHASES.length - 1];
      const status = currentProgress >= 100 ? 'done' : phase.status;

      setState({
        status,
        progress: currentProgress,
        speedMbps: speed,
        downloadedMb: ((client.file_size_mb || 500) * currentProgress) / 100,
        totalMb: client.file_size_mb || 500,
      });

      if (currentProgress >= 100) {
        clearInterval(id);
        setIntervalId(null);
        onComplete();
      }
    }, 200);
    setIntervalId(id);
  }, [client, onComplete]);

  const cancel = useCallback(() => {
    if (intervalId) {
      clearInterval(intervalId);
      setIntervalId(null);
    }
    setState({
      status: 'idle',
      progress: 0,
      speedMbps: 0,
      downloadedMb: 0,
      totalMb: client.file_size_mb || 500,
    });
  }, [intervalId]);

  useEffect(() => {
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [intervalId]);

  return { state, start, cancel };
}
