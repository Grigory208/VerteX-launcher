// Распознавание команд JARVIS-чата лаунчера. Без LLM — жёсткие шаблоны;
// всё, что не совпало, уходит в brain.ts (LLM).

import type { ModpackMod } from '@/types';
import { searchMods, getProjectVersions, pickLatestVersion, getProject } from './modrinth';

export type JarvisIntent =
  | { kind: 'build'; mcVersion?: string; loader?: string; modNames: string[] }
  | { kind: 'compat'; packName?: string }
  | { kind: 'moddev'; query: string }
  | { kind: 'find'; query: string; mcVersion?: string; loader?: string }
  | { kind: 'launch'; mcVersion?: string }
  | { kind: 'chat' };

const LOADERS = ['fabric', 'forge', 'neoforge'];

function normalizeLoader(word?: string): string | undefined {
  if (!word) return undefined;
  const t = word.toLowerCase();
  if (t.startsWith('фордж')) return 'forge';
  if (t.startsWith('неофордж')) return 'neoforge';
  if (t.startsWith('фабр')) return 'fabric';
  const w = t.replace(/[^a-z]/g, '');
  if (w === 'fabric' || /^фабр|fabr/.test(w)) return 'fabric';
  if (w === 'forge') return 'forge';
  if (w === 'neoforge' || w === 'neo') return 'neoforge';
  return undefined;
}

function extractLoader(text: string): string | undefined {
  const m = text.match(/\b(fabric|фабрик\S*|forge|фордж|neo ?forge|неофордж)\b/i);
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

  // Собери/создай сборку/клиент/модпак — триггер и существительное может разделять
  // что угодно ("создай оптимизированную сборку..."). Названия модов — после ":", ";"
  // или оборота "моды ..."; если их нет — состав предложит мозг (LLM) и всё проверится.
  const hasTrigger = /(?:собери|создай|сделай|сгенерируй|подбери|составь)/.test(t);
  const hasNoun = /(?:сборк|модпак|\bпак\b|клиент)/.test(t);
  // Создай/сделай/сгенерируй мод <название> — каркас клиентского мода (Fabric).
  // Важно: \b в JS не дружит с кириллицей, поэтому границы — вручную, а «модпак» вырезаем заранее.
  const tNoPack = t.replace(/модпак/g, ' ');
  const modDev = /(?:создай|сделай|сгенерируй|напиши)/.test(t) &&
    /(^|[^а-яё])мод(ы|а)?($|[^а-яё])/.test(tNoPack);
  if (modDev && !hasNoun) {
    const m = text.match(/мод(ы|а)?\s+([^.!?]+)/i);
    return { kind: 'moddev', query: (m?.[2] ?? '').trim() || text.trim() };
  }

  if (hasTrigger && hasNoun) {
    const colonIdx = text.search(/[:;]/);
    let modNames: string[] = [];
    if (colonIdx >= 0) {
      modNames = text.slice(colonIdx + 1).split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    } else {
      const m = text.match(/мод(?:ы|ов)?\s+([^.!?]+)/i);
      if (m) modNames = m[1].split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    }
    modNames = modNames.filter((x) => x && !x.match(/^1\.\d/) && !extractLoader(x));
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
): Promise<{ mod?: ModpackMod; problem?: string; depNames?: string[] }> {
  const hits = await searchMods({ query: name, loader, mcVersion, limit: 3 });
  if (!hits.length) return { problem: `по запросу "${name}" в Modrinth ничего не найдено (${loader} · ${mcVersion})` };

  for (const hit of hits) {
    const versions = await getProjectVersions(hit.project_id);
    const ver = pickLatestVersion(versions, mcVersion, loader);
    if (!ver) continue;
    const file = ver.files.find((f) => f.primary) ?? ver.files[0];
    if (!file) continue;
    // Required-зависимости (например, fabric-api, cloth-config) — строкой имена проектов,
    // чтобы сборщик добавил их в сборку автоматически.
    const depNames: string[] = [];
    for (const dep of ver.dependencies ?? []) {
      if (dep.dependency_type !== 'required' || !dep.project_id) continue;
      if (dep.project_id === hit.project_id) continue;
      const proj = await getProject(dep.project_id);
      if (proj?.title) depNames.push(proj.title);
    }
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
      depNames,
    };
  }
  return { problem: `"${name}": нет релиза под ${mcVersion} + ${loader}` };
}

/**
 * Собрать набор модов с авто-подтягиванием required-зависимостей.
 * Каждый.dependency тоже проверяется по Modrinth и попадает в таблицу.
 */
export async function buildWithDeps(
  names: string[],
  mcVersion: string,
  loader: string,
  opts: { maxMods?: number; onProgress?: (msg: string) => void } = {},
): Promise<{ mods: ModpackMod[]; fails: string[]; depAdded: string[] }> {
  const maxMods = opts.maxMods ?? 30;
  const mods: ModpackMod[] = [];
  const fails: string[] = [];
  const depAdded: string[] = [];
  const seen = new Set<string>();
  const queue = [...names];
  let processed = 0;
  while (queue.length) {
    if (opts.onProgress && processed > 0 && processed % 5 === 0) {
      opts.onProgress(`Проверено модов: ${processed}...`);
    }
    if (++processed > maxMods + 10) break;
    const name = queue.shift()!.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const r = await findCompatibleMod(name, mcVersion, loader);
      if (r.mod) {
        mods.push(r.mod);
        for (const dep of r.depNames ?? []) {
          const dk = dep.toLowerCase();
          if (!seen.has(dk)) {
            seen.add(dk);
            depAdded.push(dep);
            queue.push(dep);
          }
        }
      } else if (r.problem) {
        fails.push(r.problem);
      }
    } catch (e) {
      fails.push(`"${name}": ${(e as Error).message}`);
    }
  }
  return { mods, fails, depAdded };
}
