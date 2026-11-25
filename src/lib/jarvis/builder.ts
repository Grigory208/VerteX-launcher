// Сборка сборок: LLM предлагает состав, Modrinth подтверждает существование.

import { brainAnswer } from './brain';

/** Рекомендуемая Java для версии Minecraft. */
export function javaFor(mcVersion: string): string {
  const m = mcVersion.match(/^1\.(\d+)/);
  const minor = m ? parseInt(m[1], 10) : 21;
  if (minor >= 21) return 'Java 21';
  if (minor >= 18) return 'Java 17';
  if (minor >= 17) return 'Java 16/17';
  return 'Java 8';
}

/**
 * Попросить мозг составить список РЕАЛЬНЫХ модов Modrinth под запрос
 * ("собери под слабое железо"). Каждый пункт затем проверяется по Modrinth,
 * так что галлюцинации отсеются автоматически.
 */
export async function suggestModNames(userRequest: string): Promise<string[]> {
  const answer = await brainAnswer([
    {
      role: 'user',
      content:
        'Задача: составить список модов Modrinth для запроса: «' + userRequest + '».\n' +
        'Правила: только реально существующие моды из Modrinth, называй по slug или точному ' +
        'названию проекта (например: sodium, lithium, ferrite-core, entityculling, dynamic-fps, ' +
        'modernfix, immediatelyfast, c2me, servercore). ' +
        'Верни ТОЛЬКО JSON-массив строк, 4-8 позиций, без пояснений.',
    },
  ]);
  const m = answer.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x: unknown) => typeof x === 'string' && x.trim()).map((x: string) => x.trim()).slice(0, 8);
  } catch {
    return [];
  }
}
