import { useState, useCallback } from 'react';

const STORAGE_PREFIX = 'vertex_launcher_';

export function useInstalledVersions() {
  const getInstalled = useCallback((clientId: string): string | null => {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${clientId}`);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      return data.version ?? null;
    } catch {
      return null;
    }
  }, []);

  const setInstalled = useCallback((clientId: string, version: string) => {
    localStorage.setItem(
      `${STORAGE_PREFIX}${clientId}`,
      JSON.stringify({ version, installedAt: new Date().toISOString() })
    );
  }, []);

  const [refreshKey, setRefreshKey] = useState(0);
  const triggerRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return { getInstalled, setInstalled, refreshKey, triggerRefresh };
}
