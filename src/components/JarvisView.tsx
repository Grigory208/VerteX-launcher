import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Sparkles, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useModrinth } from '@/hooks/useModrinth';
import type { Modpack, ModpackMod, ViewKey } from '@/types';
import { brainAnswer, type ChatMsg } from '@/lib/jarvis/brain';
import { parseCommand, buildWithDeps, type JarvisIntent } from '@/lib/jarvis/commands';
import { checkPackCompat, compatToText, type CompatReport } from '@/lib/jarvis/compat';
import { suggestModNames, javaFor } from '@/lib/jarvis/builder';
import { LAUNCHER_KB, errorExplainPrompt } from '@/lib/jarvis/kb';
import { Markdown } from '@/lib/jarvis/markdown';

interface JarvisViewProps {
  auth: ReturnType<typeof useAuth>;
  onViewChange: (view: ViewKey) => void;
}

interface ChatEntry {
  role: 'user' | 'jarvis';
  text: string;
  report?: CompatReport;
  draftMods?: ModpackMod[];
  draftMeta?: { mcVersion: string; loader: string; name: string };
  table?: { head: string[]; rows: string[][] };
}

const HELLO =
  'На связи JARVIS. Управляю лаунчером: проверю совместимость сборки, найду мод, соберу модпак.\n' +
  'Примеры:\n' +
  '• проверь совместимость сборки «Моя сборка»\n' +
  '• собери сборку под 1.21.1 fabric: sodium, lithium, jei\n' +
  '• найди мод sodium\n' +
  '• запусти 1.21.1';

export function JarvisView({ auth, onViewChange }: JarvisViewProps) {
  const { searchMods } = useModrinth();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState<ChatEntry[]>([{ role: 'jarvis', text: HELLO }]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [entries, busy]);

  // PlayView может прислать ошибку запуска на объяснение (jarvis-explain-error).
  useEffect(() => {
    const applyPending = () => {
      const pending = sessionStorage.getItem('jarvis-pending-error');
      if (!pending) return;
      sessionStorage.removeItem('jarvis-pending-error');
      push({ role: 'user', text: pending });
      setBusy(true);
      brainAnswer([{ role: 'user', content: pending }], LAUNCHER_KB)
        .then((a) => push({ role: 'jarvis', text: a }))
        .catch((e) => push({ role: 'jarvis', text: `Ошибка: ${(e as Error).message}` }))
        .finally(() => setBusy(false));
    };
    applyPending();
    window.addEventListener('jarvis-explain-error', applyPending);
    return () => window.removeEventListener('jarvis-explain-error', applyPending);
  }, []);

  const push = (e: ChatEntry) => setEntries((es) => [...es, e]);

  const fetchPackPacks = useCallback(async (): Promise<Modpack[]> => {
    const { data } = await supabase.from('modpacks').select('*').order('updated_at', { ascending: false });
    return (data ?? []) as Modpack[];
  }, []);

  const handleBuild = useCallback(async (requestText: string, mcVersion: string, loader: string, modNames: string[]) => {
    let names = modNames;
    if (!names.length) {
      // Состав не задан — пусть мозг предложит реальные моды, Modrinth проверит каждый.
      push({ role: 'jarvis', text: `Состав не задан — прошу мозг подобрать моды под запрос, затем проверю каждый по Modrinth (${mcVersion} · ${loader})...` });
      try {
        names = await suggestModNames(requestText);
      } catch (e) {
        push({ role: 'jarvis', text: `Не смог получить состав: ${(e as Error).message}\nМожно и вручную: "собери сборку под 1.21.1 fabric: sodium, lithium"` });
        return;
      }
      if (!names.length) {
        push({ role: 'jarvis', text: 'Мозг не дал валидный список. Попробуй так: "собери сборку под 1.21.1 fabric: sodium, lithium, jei".' });
        return;
      }
    }
    push({ role: 'jarvis', text: `Подбираю версии: ${names.join(', ')} под ${mcVersion} + ${loader}. Java: ${javaFor(mcVersion)}. Лоадер лаунчер поставит сам.` });
    // Авто-подтягивание required-зависимостей (fabric-api, cloth-config и т.п.) + валидация по Modrinth.
    const { mods, fails, depAdded } = await buildWithDeps(names, mcVersion, loader, {
      onProgress: (msg) => push({ role: 'jarvis', text: msg }),
    });
    if (depAdded.length) {
      push({ role: 'jarvis', text: `Добавил required-зависимости: ${[...new Set(depAdded)].join(', ')}.` });
    }
    const rows: string[][] = [
      ...mods.map((m) => [m.title, m.file_name, 'OK']),
      ...fails.map((f) => [f.split(':')[0].replace(/"/g, ''), '—', f]),
    ];
    if (!mods.length) {
      push({ role: 'jarvis', text: `Ни один мод не подошёл:\n${fails.map((f) => `• ${f}`).join('\n')}` });
      return;
    }
    const report = await checkPackCompat(mods, mcVersion, loader);
    const lines = [`Подобрал ${mods.length} мод(ов)${fails.length ? `, не подошло: ${fails.length}` : ''}.`];
    if (!report.ok) lines.push(compatToText(report));
    push({
      role: 'jarvis',
      text: lines.join('\n') + (report.ok ? '\nВзаимные зависимости в порядке.' : ''),
      report: report,
      draftMods: mods,
      draftMeta: { mcVersion, loader, name: `Сборка JARVIS (${mcVersion} ${loader})` },
      table: { head: ['Мод', 'Файл', 'Статус'], rows },
    });
  }, []);

  const handleCompat = useCallback(async (packName?: string) => {
    const packs = await fetchPackPacks();
    if (!packs.length) {
      push({ role: 'jarvis', text: 'Сборок пока нет — создай во вкладке «Мои сборки».' });
      return;
    }
    const pack = packName
      ? packs.find((p) => p.name.toLowerCase().includes(packName.toLowerCase().replace(/[«»"]/g, '').trim()))
      : packs[0];
    if (!pack) {
      push({ role: 'jarvis', text: `Сборка «${packName}» не найдена. Есть: ${packs.slice(0, 5).map((p) => `«${p.name}»`).join(', ')}.` });
      return;
    }
    push({ role: 'jarvis', text: `Проверяю «${pack.name}»: ${pack.mc_version} + ${pack.loader}, модов ${pack.mods?.length ?? 0}...` });
    const report = await checkPackCompat(pack.mods ?? [], pack.mc_version, pack.loader);
    push({ role: 'jarvis', text: compatToText(report), report });
  }, [fetchPackPacks]);

  const handleFind = useCallback(async (query: string, mcVersion?: string, loader?: string) => {
    const l = loader ?? 'fabric';
    const found = await searchMods({ query, loader: l, mcVersion, limit: 5 });
    const hits = found.hits;
    if (!hits.length) {
      push({ role: 'jarvis', text: `По запросу «${query}» (${l}${mcVersion ? `, ${mcVersion}` : ''}) ничего не найдено.` });
      return;
    }
    push({
      role: 'jarvis',
      text:
        `Нашёл ${hits.length}:\n` +
        hits.map((h) => `• ${h.title} — ${h.description.slice(0, 80)}… (#${h.slug})`).join('\n'),
    });
  }, [searchMods]);

  const handleLaunch = useCallback((mcVersion?: string) => {
    push({ role: 'jarvis', text: `Открываю вкладку «Играть»${mcVersion ? ` — ставлю целевой версией ${mcVersion}` : ''}.` });
    if (mcVersion) {
      try { localStorage.setItem('jarvis-target-mc-version', mcVersion); } catch { /* нет localStorage */ }
    }
    onViewChange('play');
  }, [onViewChange]);

  const handleModDev = useCallback(async (query: string) => {
    const gamePath = readLauncherGamePath();
    if (!gamePath) {
      push({
        role: 'jarvis',
        text: 'Не знаю, где лежит игра. Сначала укажи путь к игре в настройках лаунчера (⚙ Настройки → «Путь к игре»), потом повтори команду.',
      });
      return;
    }
    const mcVersion = query.match(/1\.\d{1,2}(?:\.\d{1,2})?/)?.[0] ?? '1.21.1';
    push({ role: 'jarvis', text: `Генерирую каркас Fabric-мода для ${mcVersion}...` });
    const api = (window as unknown as { electronAPI?: { jarvisScaffoldMod?: (o: unknown) => Promise<{ success: boolean; error?: string; modid?: string; dir?: string; javaVersion?: number; yarn?: string; loaderVer?: string; fabricApi?: string }> } }).electronAPI;
    if (!api?.jarvisScaffoldMod) {
      push({ role: 'jarvis', text: 'Инструмент «создай мод» доступен только в приложении лаунчера (не в браузере).' });
      return;
    }
    const modName = query.replace(/1\.\d{1,2}(?:\.\d{1,2})?/g, '').replace(/под|для|fabric|фабрик/gi, '').trim() || query;
    const res = await api.jarvisScaffoldMod({ name: modName, gamePath, mcVersion });
    if (!res.success) {
      push({ role: 'jarvis', text: `Не получилось: ${res.error}` });
      return;
    }
    push({
      role: 'jarvis',
      text:
        `Каркас мода готов: **${res.modid}** в \`${res.dir}\`\n` +
        `- stack: Fabric, Minecraft ${mcVersion}, yarn ${res.yarn}, loader ${res.loaderVer}, Fabric API ${res.fabricApi}, Java ${res.javaVersion}\n` +
        `- файлы: *.java (входная точка), fabric.mod.json, build.gradle, gradle.properties\n\n` +
        'Что дальше:\n' +
        '1. Открой папку в IDEA/VS Code (подтянет Gradle).\n' +
        '2. Опиши логику в классе мода — код генерирую по запросу в чате (блоки ``` вставляй в файлы).\n' +
        '3. `gradlew build` → jar в `build/libs` — перекинешь в mods/ сборки через лаунчер.',
    });
  }, []);

  const readLauncherGamePath = (): string => {
    try {
      const s = JSON.parse(localStorage.getItem('vertex-launcher-settings') || '{}');
      if (s.gamePath) return s.gamePath;
    } catch { /* нет настроек */ }
    return '';
  };

  const sendRaw = useCallback(async (text: string) => {
    push({ role: 'user', text });
    setBusy(true);
    try {
      const intent: JarvisIntent = parseCommand(text);
      if (intent.kind === 'build') {
        await handleBuild(text, intent.mcVersion ?? '1.21.1', intent.loader ?? 'fabric', intent.modNames);
      } else if (intent.kind === 'compat') {
        await handleCompat(intent.packName);
      } else if (intent.kind === 'moddev') {
        await handleModDev(intent.query);
      } else if (intent.kind === 'find') {
        await handleFind(intent.query, intent.mcVersion, intent.loader);
      } else if (intent.kind === 'launch') {
        handleLaunch(intent.mcVersion);
      } else {
        const history: ChatMsg[] = entries
          .slice(-8)
          .map((e) => ({ role: e.role === 'user' ? 'user' : 'assistant', content: e.text }));
        history.push({ role: 'user', content: text });
        const answer = await brainAnswer(history);
        push({ role: 'jarvis', text: answer });
      }
    } catch (e) {
      push({ role: 'jarvis', text: `Ошибка: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }, [entries, handleBuild, handleCompat, handleFind, handleLaunch, handleModDev]);

  const onSend = () => {
    const t = input.trim();
    if (!t || busy) return;
    setInput('');
    void sendRaw(t);
  };

  const createDraftPack = async (idx: number) => {
    const e = entries[idx];
    if (!e?.draftMods || !e.draftMeta) return;
    if (!auth.session) {
      push({ role: 'jarvis', text: 'Чтобы создать сборку, войди в аккаунт (кнопка в сайдбаре).' });
      return;
    }
    const { error } = await supabase.from('modpacks').insert({
      name: e.draftMeta.name,
      description: 'Собрано JARVIS внутри лаунчера',
      mc_version: e.draftMeta.mcVersion,
      loader: e.draftMeta.loader,
      mods: e.draftMods.map((m) => m),
      memory: 4096,
      java_args: '',
      user_id: auth.session.user.id,
    });
    push({
      role: 'jarvis',
      text: error ? `Не удалось создать сборку: ${error.message}` : `Сборка «${e.draftMeta.name}» создана. Открываю «Мои сборки».`,
    });
    if (!error) onViewChange('modpacks');
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-launcher-border flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-launcher-accent" />
        <h2 className="text-lg font-semibold">JARVIS</h2>
        <span className="text-xs text-launcher-muted">текстовый ассистент: сборки · совместимость · поиск модов</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {entries.map((e, i) => (
          <div key={i} className={`flex ${e.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
                e.role === 'user'
                  ? 'bg-launcher-accent/20 border border-launcher-accent/40'
                  : 'bg-launcher-surface border border-launcher-border'
              }`}
            >
              <Markdown text={e.text} />
              {e.table && (
                <table className="mt-2 border-collapse w-full text-xs">
                  <thead>
                    <tr>
                      {e.table.head.map((h) => (
                        <th key={h} className="text-left border border-launcher-border px-2 py-1">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {e.table.rows.map((r, ri) => (
                      <tr key={ri}>
                        {r.map((c, ci) => (
                          <td key={ci} className="border border-launcher-border px-2 py-1 align-top">{c}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {e.report && (
                <div className={`flex items-center gap-1.5 mb-1.5 text-xs ${e.report.ok ? 'text-green-400' : 'text-amber-400'}`}>
                  {e.report.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                  {e.report.ok ? 'Совместимость: OK' : 'Совместимость: есть проблемы'}
                </div>
              )}
              {e.draftMods && e.draftMeta && (
                <button
                  onClick={() => void createDraftPack(i)}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-launcher-accent text-white text-xs"
                >
                  Создать сборку в «Моих сборках»
                </button>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="bg-launcher-surface border border-launcher-border rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm text-launcher-muted">
              <Loader2 className="w-4 h-4 animate-spin" /> думаю...
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-launcher-border flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSend(); }}
          placeholder="Например: собери сборку под 1.20.1 fabric: sodium, lithium"
          className="flex-1 bg-launcher-surface border border-launcher-border rounded-lg px-3 py-2 text-sm outline-none focus:border-launcher-accent"
          disabled={busy}
        />
        <button
          onClick={onSend}
          disabled={busy || !input.trim()}
          className="px-4 rounded-lg bg-launcher-accent text-white disabled:opacity-40 flex items-center gap-1.5 text-sm"
        >
          <Send className="w-4 h-4" /> Отправить
        </button>
      </div>
    </div>
  );
}
