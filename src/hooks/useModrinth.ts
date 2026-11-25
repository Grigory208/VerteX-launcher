import { useState, useCallback } from 'react';
import type { ModrinthSearchResult, ModrinthVersion } from '@/types';

export function useModrinth() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const searchMods = useCallback(async (params: {
    query: string;
    loader?: string;
    mcVersion?: string;
    projectType?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ hits: ModrinthSearchResult[]; total_hits: number }> => {
    setLoading(true);
    setError('');
    try {
      const facets: string[][] = [];
      if (params.projectType) facets.push([`project_type:${params.projectType}`]);
      if (params.loader) facets.push([`categories:${params.loader}`]);
      if (params.mcVersion) facets.push([`versions:${params.mcVersion}`]);

      const query: Record<string, string> = {
        limit: String(params.limit ?? 20),
        offset: String(params.offset ?? 0),
      };
      
      if (params.query) query.query = params.query;
      if (facets.length > 0) query.facets = JSON.stringify(facets);

      // Вызываем наш бэкенд вместо Supabase!
      const data = await (window as any).electronAPI.fetchModrinth({
        endpoint: 'search',
        query
      });

      return data as { hits: ModrinthSearchResult[]; total_hits: number };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Search failed';
      setError(msg);
      return { hits: [], total_hits: 0 };
    } finally {
      setLoading(false);
    }
  }, []);

  const getVersions = useCallback(async (projectId: string): Promise<ModrinthVersion[]> => {
    setLoading(true);
    setError('');
    try {
      // Вызываем наш бэкенд для получения версий
      const data = await (window as any).electronAPI.fetchModrinth({
        endpoint: `project/${projectId}/version`,
        query: {}
      });
      return data as ModrinthVersion[];
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load versions';
      setError(msg);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, searchMods, getVersions };
}