// Распознавание команд JARVIS-чата лаунчера. Без LLM — жёсткие шаблоны;
// всё, что не совпало, уходит в brain.ts (LLM).

import type { ModpackMod } from '@/types';
import { searchMods, getProjectVersions, pickLatestVersion } from './modrinth';

export type JarvisIntent =
  | { kind: 'build'; mcVersion?: string; loader?: string; modNames: string[] }
  | { kind: 'compat'; packName?: string }
  | { kind: 'find'; query: string; mcVersion?: string; loader?: string }
  | { kind: 'launch'; mcVersion?: string }
  | { kind: 'chat' };

const LOADERS = ['fabric', 'forge', 'neoforge'];

function normalizeLoader(word?: string): string | undefined {
  if (!word) return undefined;
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w === 'fabric') return 'fabric';
  if (w === 'forge') return 'forge';
  if (w === 'neoforge' || w === 'neo') return 'neoforge';
  return undefined;
}

function extractLoader(text: string): string | undefined {
  const m = text.match(/\b(fabric|forge|neo ?forge)\b/i);
  return normalizeLoader(m?.[1]);
}

function extractMcVersion(text: string): string | undefined {
  const m = text.match(/1\.\d{1,2}(?:\.\d{1,2})?/);
  return m?.[0];
}

/** Распарсить сообщение в намерение. */
export function parseCommand(text: string): JarvisIntent {
  const t = text.toLowerCase();
  const loader = extractLoader(text);
  const mcVersion = extractMcVersion(text);

  // Собери/создай сборку ... (моды после ":", "," или "мод(ы)")
  const buildMatch = t.match(/(?:собери|создай|сделай|сгенерируй)\s+(?: мне)?(?:сборку|модпак|пак)/);
  if (buildMatch) {
    const after = text.slice((buildMatch.index ?? 0) + buildMatch[0].length);
    const namesRaw =
      after.split(/[:;]|\bмод(?:ы|ов)?\b/i).slice(1).join(',') || after;
    const modNames = namesRaw
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter((s) => s && !/^\d/.test(s) && !extractLoader(s) && !extractMcVersion(s));
    return { kind: 'build', mcVersion, loader: loader ?? 'fabric', modNames };
  }

  // Проверь совместимость [сборки <название>]
  if (/совместим/.test(t)) {
    const packMatch = text.match(/(?:сборк[а-я]*|модпак[a-z]*)\s+(?:«([^»]+)»|"([^"]+)"|(.+))/i);
    const packName = (packMatch?.[1] ?? packMatch?.[2] ?? packMatch?.[3] ?? '').trim() || undefined;
    return { kind: 'compat', packName };
  }

  // Найди мод <название>
  const findMatch = t.match(/(?:найди|поищи|ищи)\s+мод(?:ы|ов)?\s+(.+)/);
  if (findMatch) {
    const q = text.slice((findMatch.index ?? 0) + findMatch[0].length).trim();
    return { kind: 'find', query: q, mcVersion, loader };
  }

  // Запусти / играть [версия]
  if (/(?:запусти|запускай|играть|давай играть|включи игру)/.test(t)) {
    return { kind: 'launch', mcVersion };
  }

  return { kind: 'chat' };
}

/** Найти мод на Modrinth по названию и подобрать совместимую версию. */
export async function findCompatibleMod(
  name: string,
  mcVersion: string,
  loader: string,
): Promise<{ mod?: ModpackMod; problem?: string }> {
  const hits = await searchMods({ query: name, loader, mcVersion, limit: 3 });
  if (!hits.length) return { problem: `по запросу "${name}" в Modrinth ничего не найдено (${loader} · ${mcVersion})` };

  for (const hit of hits) {
    const versions = await getProjectVersions(hit.project_id);
    const ver = pickLatestVersion(versions, mcVersion, loader);
    if (!ver) continue;
    const file = ver.files.find((f) => f.primary) ?? ver.files[0];
    if (!file) continue;
    return {
      mod: {
        project_id: hit.project_id,
        slug: hit.slug,
        title: hit.title,
        icon_url: hit.icon_url,
        version_id: ver.id,
        file_name: file.filename,
        download_url: file.url,
        categories: hit.categories ?? [],
      },
    };
  }
  return { problem: `"${name}": нет релиза под ${mcVersion} + ${loader}` };
}
