import { useState, useCallback } from 'react';
import type { ModrinthSearchResult, ModrinthVersion } from '@/types';

const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/modrinth-proxy`;

async function fetchApi(modrinthPath: string, extraParams?: URLSearchParams): Promise<unknown> {
  const params = new URLSearchParams(extraParams);
  params.set('path', modrinthPath);
  const res = await fetch(`${API_BASE}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      Apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

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
      if (params.projectType) {
        facets.push([`project_type:${params.projectType}`]);
      }
      if (params.loader) {
        facets.push([`categories:${params.loader}`]);
      }
      if (params.mcVersion) {
        facets.push([`versions:${params.mcVersion}`]);
      }

      const searchParams = new URLSearchParams();
      searchParams.set('limit', String(params.limit ?? 20));
      searchParams.set('offset', String(params.offset ?? 0));
      if (params.query) searchParams.set('query', params.query);
      if (facets.length > 0) searchParams.set('facets', JSON.stringify(facets));

      const data = await fetchApi('/search', searchParams) as { hits: ModrinthSearchResult[]; total_hits: number };
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      return { hits: [], total_hits: 0 };
    } finally {
      setLoading(false);
    }
  }, []);

  const getVersions = useCallback(async (projectId: string): Promise<ModrinthVersion[]> => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchApi(`/project/${projectId}/version`) as ModrinthVersion[];
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load versions');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, searchMods, getVersions };
}
