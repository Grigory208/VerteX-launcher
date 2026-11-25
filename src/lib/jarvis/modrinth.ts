// Тонкий клиент Modrinth для JARVIS: через IPC-прокси лаунчера, в браузере — напрямую.

export interface ModrinthHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  versions: string[];
  categories: string[];
  icon_url: string;
}

export interface ModrinthVer {
  id: string;
  project_id: string;
  version_number: string;
  version_type: string;
  loaders: string[];
  game_versions: string[];
  dependencies: { project_id: string; dependency_type: string }[];
  files: { url: string; filename: string; primary: boolean; size: number; file_type: string }[];
}

async function modrinth(endpoint: string, query: Record<string, string> = {}): Promise<unknown> {
  const api = (window as unknown as Record<string, unknown>).electronAPI as
    | { fetchModrinth?: (a: unknown) => Promise<unknown> }
    | undefined;
  if (api?.fetchModrinth) {
    return (await api.fetchModrinth({ endpoint, query })) as unknown;
  }
  // Резерв для dev-режима в браузере (вне Electron).
  const qs = new URLSearchParams(query).toString();
  const res = await fetch(`https://api.modrinth.com/v2/${endpoint}${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(`Modrinth HTTP ${res.status}`);
  return res.json();
}

export async function searchMods(params: {
  query: string;
  loader?: string;
  mcVersion?: string;
  limit?: number;
}): Promise<ModrinthHit[]> {
  const facets: string[][] = [['project_type:mod']];
  if (params.loader) facets.push([`categories:${params.loader}`]);
  if (params.mcVersion) facets.push([`versions:${params.mcVersion}`]);
  const query: Record<string, string> = { limit: String(params.limit ?? 5) };
  if (params.query) query.query = params.query;
  query.facets = JSON.stringify(facets);
  const data = (await modrinth('search', query)) as { hits?: ModrinthHit[] };
  return data?.hits ?? [];
}

export async function getProjectVersions(projectId: string): Promise<ModrinthVer[]> {
  const data = (await modrinth(`project/${projectId}/version`)) as ModrinthVer[];
  return Array.isArray(data) ? data : [];
}

/** Версия проекта по version_id. */
export function findVersion(versions: ModrinthVer[], versionId: string): ModrinthVer | undefined {
  return versions.find((v) => v.id === versionId);
}

/** Самая свежая версия проекта под (mcVersion, loader). */
export function pickLatestVersion(versions: ModrinthVer[], mcVersion: string, loader: string): ModrinthVer | undefined {
  return versions.find((v) => v.loaders.includes(loader) && v.game_versions.includes(mcVersion));
}
