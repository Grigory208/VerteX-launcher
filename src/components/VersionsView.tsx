import { useState, useEffect, useCallback } from 'react';
import {
  Package, Loader2, Download, CheckCircle2, Search, ChevronDown, Boxes,
} from 'lucide-react';

const STORAGE_KEY = 'vertex-installed-versions';
const SETTINGS_KEY = 'vertex-launcher-settings';

interface InstalledVersion {
  version: string;
  loader: string;
  installedAt: string;
}

interface MojangVersion {
  id: string;
  type: string;
  releaseTime: string;
}

function getInstalled(): InstalledVersion[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as InstalledVersion[]) : [];
  } catch {
    return [];
  }
}

function setInstalled(list: InstalledVersion[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

// ⬇️ УМНОЕ ОПРЕДЕЛЕНИЕ ТИПА ВЕРСИИ (ИСПРАВЛЯЕТ БАГ MOJANG) ⬇️
function getRealVersionType(id: string, apiType: string): string {
  // Если версия выглядит как 1.5, 1.21.1, 1.20.4 — это ТОЧНО релиз
  if (/^\d+\.\d+(\.\d+)?$/.test(id)) return 'release';
  
  // Если версия выглядит как 13w24b, 24w14a — это ТОЧНО снапшот
  if (/^\d{2}w\d{2}[a-z]$/.test(id)) return 'snapshot';
  
  // Всякие rd-160052, inf-20100618, c0.30 — это старые альфы/беты
  if (id.startsWith('rd-') || id.startsWith('inf-') || /^[abc]/.test(id)) {
    return apiType === 'old_beta' ? 'old_beta' : 'old_alpha';
  }
  
  return apiType;
}

const LOADERS = [
  { id: 'vanilla', name: 'Vanilla', desc: 'Чистая версия без модов' },
  { id: 'fabric', name: 'Fabric', desc: 'Лёгкий загрузчик модов' },
  { id: 'forge', name: 'Forge', desc: 'Классический загрузчик модов' },
  { id: 'quilt', name: 'Quilt', desc: 'Современный аналог Fabric' },
  { id: 'neoforge', name: 'NeoForge', desc: 'Форк Forge нового поколения' },
  { id: 'optifine', name: 'OptiFine', desc: 'Оптимизация и шейдеры' },
];

const FILTERS = [
  { value: 'release', label: 'Релизы' },
  { value: 'snapshot', label: 'Снапшоты' },
  { value: 'all', label: 'Все версии' },
];

type InstallState = 'idle' | 'downloading' | 'done';

interface InstallProgress {
  version: string;
  loader: string;
  state: InstallState;
  progress: number;
}

export function VersionsView() {
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState('release');
  const [installed, setInstalledState] = useState<InstalledVersion[]>(getInstalled());
  const [installing, setInstalling] = useState<InstallProgress | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  
  const [versions, setVersions] = useState<MojangVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(true);

  useEffect(() => {
    const fetchVersions = async () => {
      try {
        const api = (window as any).electronAPI;
        if (api?.fetchMojangVersions) {
          const data = await api.fetchMojangVersions();
          const sorted = data.sort((a: any, b: any) => 
            new Date(b.releaseTime).getTime() - new Date(a.releaseTime).getTime()
          );
          setVersions(sorted);
        }
      } catch (e) {
        console.error('Ошибка загрузки версий:', e);
      } finally {
        setLoadingVersions(false);
      }
    };
    fetchVersions();
  }, []);

  const filteredVersions = versions.filter((v) => {
    const matchesQuery = v.id.toLowerCase().includes(query.toLowerCase());
    
    // Используем нашу умную функцию вместо v.type
    const realType = getRealVersionType(v.id, v.type);
    let matchesType = false;
    if (filterType === 'all') matchesType = true;
    else matchesType = realType === filterType;
    
    return matchesQuery && matchesType;
  });

  const handleInstall = useCallback(async (version: string, loader: string) => {
    if (installing) return;
    
    setInstalling({ version, loader, state: 'downloading', progress: 50 });

    try {
      const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      const result = await (window as any).electronAPI.installLoader({ 
        version, 
        loader,
        gamePath: settings.gamePath
      });
      
      if (result.success) {
        const newEntry: InstalledVersion = { version, loader, installedAt: new Date().toISOString() };
        const updated = [...installed.filter((i) => !(i.version === version && i.loader === loader)), newEntry];
        setInstalled(updated);
        setInstalledState(updated);
        
        setInstalling({ version, loader, state: 'done', progress: 100 });
        setTimeout(() => setInstalling(null), 1500);
      } else {
        alert(`Ошибка установки: ${result.error}`);
        setInstalling(null);
      }
    } catch (error) {
      alert('Не удалось запустить установку. Проверь консоль.');
      setInstalling(null);
    }
  }, [installing, installed]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-8 pt-6 pb-4 border-b border-launcher-border bg-launcher-surface/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-launcher-primary/30 to-launcher-accent/20 flex items-center justify-center">
            <Boxes className="w-5 h-5 text-launcher-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-launcher-text font-display">Версии Minecraft</h2>
            <p className="text-sm text-launcher-muted">Установка чистых версий и загрузчиков модов</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 max-w-2xl">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-launcher-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск версии..."
              className="w-full bg-launcher-bg border border-launcher-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-launcher-text focus:border-launcher-primary focus:outline-none transition-colors"
            />
          </div>
          <div className="relative min-w-[150px]">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full appearance-none bg-launcher-bg border border-launcher-border rounded-xl pl-4 pr-10 py-2.5 text-sm text-launcher-text focus:border-launcher-primary focus:outline-none transition-colors cursor-pointer"
            >
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-launcher-muted pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
        {loadingVersions ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-launcher-primary animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
            {filteredVersions.map((versionObj, index) => {
              const rowIndex = Math.floor(index / 3);
              const realType = getRealVersionType(versionObj.id, versionObj.type);
              
              return (
                <VersionCard
                  key={versionObj.id}
                  version={versionObj.id}
                  type={realType} // <-- ПЕРЕДАЕМ ИСПРАВЛЕННЫЙ ТИП
                  installed={installed.filter((i) => i.version === versionObj.id)}
                  installing={installing}
                  onInstall={handleInstall}
                  isExpanded={expandedRow === rowIndex}
                  onToggle={() => setExpandedRow(prev => prev === rowIndex ? null : rowIndex)}
                />
              );
            })}
          </div>
        )}
        {!loadingVersions && filteredVersions.length === 0 && (
          <div className="text-center py-20 text-launcher-muted">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>Версия не найдена</p>
          </div>
        )}
      </div>
    </div>
  );
}

function VersionCard({ version, type, installed, installing, onInstall, isExpanded, onToggle }: {
  version: string;
  type: string;
  installed: InstalledVersion[];
  installing: InstallProgress | null;
  onInstall: (version: string, loader: string) => void;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="bg-launcher-surface border border-launcher-border rounded-xl overflow-hidden transition-all hover:border-launcher-primary/30">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-launcher-elevated flex items-center justify-center">
            <Package className="w-5 h-5 text-launcher-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-launcher-text font-mono">{version}</p>
              {type === 'snapshot' && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-launcher-warning/10 text-launcher-warning border border-launcher-warning/20 uppercase font-bold">
                  Снапшот
                </span>
              )}
              {(type === 'old_beta' || type === 'old_alpha') && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-launcher-muted/10 text-launcher-muted border border-launcher-muted/20 uppercase font-bold">
                  Старая
                </span>
              )}
            </div>
            <p className="text-[10px] text-launcher-muted mt-0.5">
              {installed.length > 0
                ? `${installed.length} загрузчик(ов) установлено`
                : 'Не установлено'}
            </p>
          </div>
        </div>
        <button
          onClick={onToggle}
          className="p-1.5 rounded-md text-launcher-muted hover:text-launcher-text hover:bg-launcher-elevated transition-colors focus:outline-none focus:ring-0"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {isExpanded && (
        <div className="border-t border-launcher-border p-3 space-y-2 animate-fade-in">
          {LOADERS.map((loader) => {
            const isInstalledLoader = installed.some((i) => i.loader === loader.id);
            const isInstalling = installing?.version === version && installing?.loader === loader.id;

            return (
              <div key={loader.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-launcher-bg">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-launcher-text">{loader.name}</p>
                  <p className="text-[10px] text-launcher-muted truncate">{loader.desc}</p>
                </div>

                {isInstalling ? (
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-launcher-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-launcher-primary transition-all duration-200"
                        style={{ width: `${installing.progress}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-launcher-muted font-mono w-8 text-right">
                      {Math.round(installing.progress)}%
                    </span>
                  </div>
                ) : isInstalledLoader ? (
                  <span className="flex items-center gap-1 text-xs text-launcher-primary">
                    <CheckCircle2 className="w-4 h-4" />
                  </span>
                ) : (
                  <button
                    onClick={() => onInstall(version, loader.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-launcher-primary/10 text-launcher-primary text-xs font-medium hover:bg-launcher-primary/20 transition-colors focus:outline-none focus:ring-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Установить
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}