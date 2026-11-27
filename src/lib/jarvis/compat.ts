// Проверка совместимости модов модпака (Modrinth): версия MC, лоадер, зависимости.

import type { ModpackMod } from '@/types';
import { getProjectVersions, findVersion, type ModrinthVer } from './modrinth';

export interface CompatProblem {
  mod: string;
  kind: 'mc_version' | 'loader' | 'file_missing' | 'dependency' | 'fetch_error';
  detail: string;
}

export interface CompatReport {
  ok: boolean;
  checked: number;
  problems: CompatProblem[];
  summary: string;
}

function versionsLabel(v: ModrinthVer): string {
  return `${v.version_number} (${v.loaders.join('/')} · ${v.game_versions.slice(-3).join(', ')})`;
}

export async function checkPackCompat(
  mods: ModpackMod[],
  mcVersion: string,
  loader: string,
): Promise<CompatReport> {
  const problems: CompatProblem[] = [];
  const modList = mods ?? [];
  const present = new Set(modList.map((m) => m.project_id));

  for (const mod of modList) {
    try {
      const versions = await getProjectVersions(mod.project_id);
      if (!versions.length) {
        problems.push({ mod: mod.title, kind: 'fetch_error', detail: 'Modrinth не вернул версии' });
        continue;
      }
      const ver = findVersion(versions, mod.version_id);
      if (!ver) {
        // Файла сборки нет среди версий — мод обновили/удалили; ищем замену.
        const alt = versions.find(
          (v) => v.loaders.includes(loader) && v.game_versions.includes(mcVersion),
        );
        problems.push({
          mod: mod.title,
          kind: 'file_missing',
          detail: alt
            ? `файл сборки устарел; есть замена: ${versionsLabel(alt)}`
            : 'файл сборки устарел; совместимой замены не найдено',
        });
        continue;
      }
      if (!ver.game_versions.includes(mcVersion)) {
        problems.push({
          mod: mod.title,
          kind: 'mc_version',
          detail: `${versionsLabel(ver)} не поддерживает Minecraft ${mcVersion}`,
        });
      }
      if (!ver.loaders.includes(loader)) {
        problems.push({
          mod: mod.title,
          kind: 'loader',
          detail: `${versionsLabel(ver)} не поддерживает ${loader}`,
        });
      }
      for (const dep of ver.dependencies) {
        if (dep.dependency_type === 'required' && !present.has(dep.project_id)) {
          problems.push({
            mod: mod.title,
            kind: 'dependency',
            detail: 'требуется обязательная зависимость, которой нет в сборке',
          });
        }
      }
    } catch (e) {
      problems.push({ mod: mod.title, kind: 'fetch_error', detail: (e as Error).message });
    }
  }

  const ok = problems.length === 0;
  const bad = problems.length;
  const summary = ok
    ? `Все ${modList.length} мод(ов) совместимы с ${mcVersion} + ${loader}.`
    : `Проверено ${modList.length} мод(ов), проблем: ${bad}.`;
  return { ok, checked: modList.length, problems, summary };
}

export function compatToText(report: CompatReport): string {
  const lines = [report.summary, ''];
  for (const p of report.problems) {
    const kindLabel: Record<CompatProblem['kind'], string> = {
      mc_version: 'версия MC',
      loader: 'лоадер',
      file_missing: 'файл устарел',
      dependency: 'зависимость',
      fetch_error: 'ошибка запроса',
    };
    lines.push(`• ${p.mod} — ${kindLabel[p.kind]}: ${p.detail}`);
  }
  return lines.join('\n');
}
