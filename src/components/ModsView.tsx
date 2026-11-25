import { useState, useEffect, useCallback, useRef } from 'react';
import { useModrinth } from '@/hooks/useModrinth';
import type { ModrinthSearchResult, ModrinthVersion } from '@/types';
import {
  Search, Download, Loader2, Package, X, ChevronDown, ExternalLink, Tag, FolderPlus, Filter
} from 'lucide-react';

const LOADERS = [
  { value: '', label: 'Все загрузчики' },
  { value: 'fabric', label: 'Fabric' },
  { value: 'forge', label: 'Forge' },
  { value: 'quilt', label: 'Quilt' },
  { value: 'neoforge', label: 'NeoForge' },
];

const PROJECT_TYPES = [
  { value: 'mod', label: 'Моды' },
  { value: 'modpack', label: 'Сборки' },
  { value: 'resourcepack', label: 'Ресурс-паки' },
  { value: 'shader', label: 'Шейдеры' },
];

const SETTINGS_KEY = 'vertex-launcher-settings';

function formatDownloads(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function ModsView() {
  const { searchMods, getVersions, loading, error } = useModrinth();
  const [query, setQuery] = useState('');
  const [loader, setLoader] = useState('');
  const [mcVersion, setMcVersion] = useState('');
  const [projectType, setProjectType] = useState('mod');
  const [results, setResults] = useState<ModrinthSearchResult[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<ModrinthSearchResult | null>(null);
  const [versions, setVersions] = useState<ModrinthVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  
  const [mcVersions, setMcVersions] = useState<string[]>([]);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const LIMIT = 24;

  useEffect(() => {
    const fetchVersions = async () => {
      try {
        const api = (window as any).electronAPI;
        if (api?.fetchMojangVersions) {
          const data = await api.fetchMojangVersions();
          const versionIds = data.filter((v: any) => v.type === 'release').map((v: any) => v.id);
          setMcVersions(versionIds);
        } else {
          setMcVersions(['1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.19.2', '1.18.2', '1.16.5', '1.12.2']);
        }
      } catch (e) {
        console.error('Ошибка загрузки версий:', e);
      }
    };
    fetchVersions();
  }, []);

  const doSearch = useCallback(async (reset: boolean) => {
    const o = reset ? 0 : offset;
    const { hits, total_hits } = await searchMods({
      query, loader: loader || undefined, mcVersion: mcVersion || undefined, projectType, limit: LIMIT, offset: o,
    });
    if (reset) { setResults(hits); setOffset(LIMIT); } else { setResults((prev) => [...prev, ...hits]); setOffset(o + LIMIT); }
    setTotalHits(total_hits);
  }, [query, loader, mcVersion, projectType, offset, searchMods]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { doSearch(true); }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, loader, mcVersion, projectType, doSearch]);

  const openDetail = async (mod: ModrinthSearchResult) => {
    setDetail(mod); setVersions([]); setVersionsLoading(true);
    const v = await getVersions(mod.project_id);
    setVersions(v); setVersionsLoading(false);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-8 pt-6 pb-4 border-b border-launcher-border bg-launcher-surface/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-launcher-accent/30 to-launcher-primary/20 flex items-center justify-center">
            <Package className="w-5 h-5 text-launcher-accent" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-launcher-text font-display">Моды с Modrinth</h2>
            <p className="text-sm text-launcher-muted">Тысячи модов, сборок, шейдеров и ресурспаков — поиск и установка прямо в лаунчере</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-launcher-muted" />
            <input
              type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск модов..."
              className="w-full bg-launcher-bg border border-launcher-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-launcher-text focus:border-launcher-primary focus:outline-none transition-colors"
            />
          </div>
          <FilterSelect value={projectType} onChange={(v) => { setProjectType(v); }} options={PROJECT_TYPES} />
          <FilterSelect value={loader} onChange={setLoader} options={LOADERS} />
          <FilterSelect 
            value={mcVersion} 
            onChange={setMcVersion} 
            options={[{ value: '', label: 'Все версии' }, ...mcVersions.map((v) => ({ value: v, label: v }))]} 
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
        {error && (<div className="text-center py-20 text-launcher-danger"><p>{error}</p></div>)}
        {!error && results.length === 0 && !loading && (
          <div className="text-center py-20 text-launcher-muted"><Package className="w-12 h-12 mx-auto mb-3 opacity-40" /><p>Ничего не найдено. Попробуйте изменить запрос или фильтры.</p></div>
        )}
        {loading && results.length === 0 ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-launcher-primary animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {results.map((mod) => (<ModCard key={mod.project_id} mod={mod} onClick={() => openDetail(mod)} />))}
          </div>
        )}
        {!loading && results.length > 0 && results.length < totalHits && (
          <div className="flex justify-center mt-6">
            <button onClick={() => doSearch(false)} className="px-6 py-2.5 rounded-lg bg-launcher-surface border border-launcher-border text-launcher-text text-sm font-medium hover:border-launcher-primary/50 transition-colors">
              Загрузить ещё
            </button>
          </div>
        )}
      </div>

      {detail && (
        <ModDetailModal 
          mod={detail} 
          versions={versions} 
          versionsLoading={versionsLoading} 
          onClose={() => setDetail(null)} 
        />
      )}
    </div>
  );
}

function FilterSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} className="appearance-none bg-launcher-bg border border-launcher-border rounded-xl pl-4 pr-9 py-2.5 text-sm text-launcher-text focus:border-launcher-primary focus:outline-none transition-colors cursor-pointer">
        {options.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-launcher-muted pointer-events-none" />
    </div>
  );
}

function ModCard({ mod, onClick }: { mod: ModrinthSearchResult; onClick: () => void }) {
  return (
    <button onClick={onClick} className="bg-launcher-surface border border-launcher-border rounded-xl overflow-hidden hover:border-launcher-primary/40 transition-all duration-200 group text-left flex flex-col">
      <div className="relative h-28 bg-launcher-elevated overflow-hidden flex items-center justify-center">
        {mod.icon_url ? (<img src={mod.icon_url} alt={mod.title} className="w-16 h-16 rounded-lg object-cover group-hover:scale-110 transition-transform duration-300" loading="lazy" />) : (<Package className="w-12 h-12 text-launcher-border" />)}
        <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-launcher-bg/80 backdrop-blur-sm rounded-full px-2 py-0.5">
          <Download className="w-3 h-3 text-launcher-muted" /><span className="text-[10px] font-mono text-launcher-muted">{formatDownloads(mod.downloads)}</span>
        </div>
      </div>
      <div className="p-3 flex flex-col flex-1">
        <h3 className="text-sm font-bold text-launcher-text truncate group-hover:text-launcher-primary transition-colors">{mod.title}</h3>
        <p className="text-xs text-launcher-muted line-clamp-2 mt-1 flex-1">{mod.description}</p>
        <div className="flex flex-wrap gap-1 mt-2">
          {mod.categories.slice(0, 3).map((cat) => (<span key={cat} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-launcher-elevated text-launcher-muted">{cat}</span>))}
        </div>
      </div>
    </button>
  );
}

function ModDetailModal({ mod, versions, versionsLoading, onClose }: { mod: ModrinthSearchResult; versions: ModrinthVersion[]; versionsLoading: boolean; onClose: () => void; }) {
  const [selectedVersion, setSelectedVersion] = useState(0);
  const [adding, setAdding] = useState(false);
  const [downloading, setDownloading] = useState(false);
  
  const [activeLoader, setActiveLoader] = useState<string>('');
  const [activeGameVersion, setActiveGameVersion] = useState<string>('');

  const availableLoaders = Array.from(new Set(versions.flatMap(v => v.loaders)));

  useEffect(() => {
    if (availableLoaders.length > 0 && !activeLoader) {
      setActiveLoader(availableLoaders[0]);
    }
  }, [availableLoaders, activeLoader]);

  const loaderVersions = versions.filter(v => v.loaders.includes(activeLoader));
  
  const availableGameVersions = Array.from(new Set(loaderVersions.flatMap(v => v.game_versions)))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));

  const filteredVersions = loaderVersions.filter(v => 
    activeGameVersion === '' || v.game_versions.includes(activeGameVersion)
  );

  const currentVersion = filteredVersions[selectedVersion] || filteredVersions[0];
  const file = currentVersion?.files.find((f) => f.primary) ?? currentVersion?.files[0];

  const handleLoaderChange = (l: string) => {
    setActiveLoader(l);
    setActiveGameVersion('');
    setSelectedVersion(0);
  };

  const handleAddToModpack = () => {
    setAdding(true);
    const modData = {
      project_id: mod.project_id,
      slug: mod.slug,
      title: mod.title,
      icon_url: mod.icon_url,
      categories: mod.categories,
    };
    
    const existing = JSON.parse(localStorage.getItem('pending-mod-to-modpack') || '[]');
    if (!existing.some((m: any) => m.project_id === modData.project_id)) {
      existing.push(modData);
      localStorage.setItem('pending-mod-to-modpack', JSON.stringify(existing));
    }
    
    window.dispatchEvent(new CustomEvent('add-mod-to-modpack', { detail: modData }));
    setAdding(false);
    onClose();
    window.dispatchEvent(new CustomEvent('navigate-to-modpacks'));
  };

  const handleDownload = async () => {
    if (!file) return;
    setDownloading(true);
    try {
      const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      if (!(window as any).electronAPI?.downloadMod) throw new Error('Функция downloadMod не найдена. Перезапусти терминал!');
      const result = await (window as any).electronAPI.downloadMod({ url: file.url, filename: file.filename, gamePath: settings.gamePath });
      if (result.success) { alert(`Мод "${mod.title}" успешно скачан в папку mods!`); onClose(); } else { alert(`Ошибка скачивания: ${result.error}`); }
    } catch (e: any) {
      console.error('Ошибка при скачивании мода:', e);
      alert(`Не удалось скачать: ${e.message || 'Проверь консоль (F12)'}`);
    } finally { setDownloading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[calc(100vh-48px)] overflow-y-auto scrollbar-thin bg-launcher-surface border border-launcher-border rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-6 border-b border-launcher-border">
          <div className="flex items-center gap-4">
            {mod.icon_url ? (<img src={mod.icon_url} alt={mod.title} className="w-16 h-16 rounded-xl object-cover" />) : (<div className="w-16 h-16 rounded-xl bg-launcher-elevated flex items-center justify-center"><Package className="w-8 h-8 text-launcher-border" /></div>)}
            <div>
              <h2 className="text-xl font-bold text-launcher-text font-display">{mod.title}</h2>
              <p className="text-sm text-launcher-muted">от {mod.author}</p>
              <div className="flex items-center gap-3 mt-1.5 text-xs text-launcher-muted">
                <span className="flex items-center gap-1"><Download className="w-3 h-3" /> {formatDownloads(mod.downloads)}</span>
                <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> {mod.license?.name ?? 'N/A'}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-launcher-muted hover:text-launcher-text hover:bg-launcher-elevated transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-sm text-launcher-text leading-relaxed">{mod.description}</p>
          <div className="flex flex-wrap gap-1.5">
            {mod.categories.map((cat) => (<span key={cat} className="text-xs font-medium px-2.5 py-1 rounded-full bg-launcher-elevated text-launcher-muted border border-launcher-border">{cat}</span>))}
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-launcher-text uppercase tracking-wide">Выберите версию</h3>
            </div>

            {versionsLoading ? (
              <div className="flex items-center gap-2 text-launcher-muted text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Загрузка версий...</div>
            ) : versions.length > 0 ? (
              <>
                {/* ⬇️ СДВИНУТЫЙ ВЛЕВО БЛОК ФИЛЬТРОВ ⬇️ */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-start gap-4 mb-4 bg-launcher-bg p-2.5 rounded-xl border border-launcher-border/50">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-launcher-muted font-bold uppercase tracking-wider mr-1">Загрузчик:</span>
                    {availableLoaders.map(l => (
                      <button
                        key={l}
                        onClick={() => handleLoaderChange(l)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${activeLoader === l ? 'bg-launcher-primary text-launcher-bg shadow-md' : 'bg-launcher-surface text-launcher-muted hover:text-launcher-text border border-transparent hover:border-launcher-border'}`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>

                  {availableGameVersions.length > 0 && (
                    <div className="flex items-center gap-2 sm:border-l border-launcher-border sm:pl-4">
                      <span className="text-[11px] text-launcher-muted font-bold uppercase tracking-wider flex items-center gap-1">
                        <Filter className="w-3 h-3" /> Версия:
                      </span>
                      <div className="relative">
                        <select
                          value={activeGameVersion}
                          onChange={(e) => { setActiveGameVersion(e.target.value); setSelectedVersion(0); }}
                          className={`appearance-none rounded-lg pl-3 pr-8 py-1.5 text-xs font-mono font-bold cursor-pointer transition-all outline-none border ${
                            activeGameVersion 
                              ? 'bg-launcher-primary/15 border-launcher-primary text-launcher-primary' 
                              : 'bg-launcher-surface border-launcher-border text-launcher-text hover:border-launcher-primary/50'
                          }`}
                        >
                          <option value="">Все версии</option>
                          {availableGameVersions.map(gv => (
                            <option key={gv} value={gv}>{gv}</option>
                          ))}
                        </select>
                        <ChevronDown className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none ${activeGameVersion ? 'text-launcher-primary' : 'text-launcher-muted'}`} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin pr-2">
                  {filteredVersions.length > 0 ? (
                    filteredVersions.map((v, i) => {
                      const versionFile = v.files.find((f) => f.primary) ?? v.files[0];
                      return (
                        <button key={v.id} onClick={() => setSelectedVersion(i)} className={`w-full text-left p-3 rounded-lg border transition-all ${selectedVersion === i ? 'border-launcher-primary bg-launcher-primary/10' : 'border-launcher-border hover:border-launcher-border/70 bg-launcher-bg'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-launcher-text truncate">{v.name || v.version_number}</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {v.game_versions.slice(0, 5).map((gv) => (<span key={gv} className="text-[10px] px-1.5 py-0.5 rounded bg-launcher-primary/10 text-launcher-primary">{gv}</span>))}
                                {v.game_versions.length > 5 && <span className="text-[10px] text-launcher-muted">...</span>}
                              </div>
                            </div>
                            {versionFile && (<span className="text-[10px] text-launcher-muted font-mono whitespace-nowrap">{(versionFile.size / 1024 / 1024).toFixed(1)} МБ</span>)}
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <p className="text-sm text-launcher-muted text-center py-4">Нет версий для выбранной версии MC</p>
                  )}
                </div>
              </>
            ) : (<p className="text-sm text-launcher-muted">Версии не найдены</p>)}
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button onClick={handleDownload} disabled={!file || downloading} className="flex-1 min-w-[150px] py-3 rounded-lg bg-launcher-primary text-launcher-bg font-bold text-sm hover:bg-launcher-primary-dim disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {downloading ? 'Скачивание...' : 'Скачать'}
            </button>
            <button onClick={handleAddToModpack} disabled={filteredVersions.length === 0 || adding} className="flex-1 min-w-[150px] py-3 rounded-lg bg-launcher-elevated text-launcher-text border border-launcher-border font-bold text-sm hover:bg-launcher-border disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderPlus className="w-4 h-4" />}
              {adding ? 'Добавление...' : 'В модпак'}
            </button>
            <a href={`https://modrinth.com/${mod.project_type}/${mod.slug}`} target="_blank" rel="noopener noreferrer" className="px-4 py-3 rounded-lg bg-launcher-elevated text-launcher-text text-sm font-medium hover:bg-launcher-border transition-colors flex items-center justify-center gap-2" title="Открыть на Modrinth">
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}