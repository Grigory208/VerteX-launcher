import { useState, useEffect, useCallback } from 'react';
import {
  Package,
  Loader2,
  Download,
  CheckCircle2,
  Search,
  ChevronDown,
  Boxes,
} from 'lucide-react';

const STORAGE_KEY = 'vertex-installed-versions';

interface InstalledVersion {
  version: string;
  loader: string;
  installedAt: string;
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

const VANILLA_VERSIONS = [
  '1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.1',
  '1.19.4', '1.19.2', '1.18.2', '1.17.1', '1.16.5',
  '1.12.2', '1.8.9', '1.7.10',
];

const LOADERS = [
  { id: 'vanilla', name: 'Vanilla', desc: 'Чистая версия без модов' },
  { id: 'fabric', name: 'Fabric', desc: 'Лёгкий загрузчик модов' },
  { id: 'forge', name: 'Forge', desc: 'Классический загрузчик модов' },
  { id: 'quilt', name: 'Quilt', desc: 'Современный аналог Fabric' },
  { id: 'neoforge', name: 'NeoForge', desc: 'Форк Forge нового поколения' },
  { id: 'optifine', name: 'OptiFine', desc: 'Оптимизация и шейдеры' },
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
  const [installed, setInstalledState] = useState<InstalledVersion[]>(getInstalled());
  const [installing, setInstalling] = useState<InstallProgress | null>(null);

  const filteredVersions = VANILLA_VERSIONS.filter((v) =>
    v.toLowerCase().includes(query.toLowerCase())
  );

  const isInstalled = (version: string, loader: string) =>
    installed.some((i) => i.version === version && i.loader === loader);

  const handleInstall = useCallback((version: string, loader: string) => {
    if (installing) return;
    setInstalling({ version, loader, state: 'downloading', progress: 0 });

    let progress = 0;
    const id = setInterval(() => {
      progress = Math.min(progress + 5 + Math.random() * 10, 100);
      setInstalling({ version, loader, state: progress >= 100 ? 'done' : 'downloading', progress });

      if (progress >= 100) {
        clearInterval(id);
        const newEntry: InstalledVersion = { version, loader, installedAt: new Date().toISOString() };
        const updated = [...installed.filter((i) => !(i.version === version && i.loader === loader)), newEntry];
        setInstalled(updated);
        setInstalledState(updated);
        setTimeout(() => setInstalling(null), 1500);
      }
    }, 200);
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
            <p className="text-sm text-launcher-muted">Установка чистых версий и загрузчиков модов — Vanilla, Fabric, Forge, NeoForge, Quilt, OptiFine</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-launcher-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск версии..."
            className="w-full bg-launcher-bg border border-launcher-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-launcher-text focus:border-launcher-primary focus:outline-none transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVersions.map((version) => (
            <VersionCard
              key={version}
              version={version}
              installed={installed.filter((i) => i.version === version)}
              installing={installing}
              onInstall={handleInstall}
            />
          ))}
        </div>
        {filteredVersions.length === 0 && (
          <div className="text-center py-20 text-launcher-muted">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>Версия не найдена</p>
          </div>
        )}
      </div>
    </div>
  );
}

function VersionCard({ version, installed, installing, onInstall }: {
  version: string;
  installed: InstalledVersion[];
  installing: InstallProgress | null;
  onInstall: (version: string, loader: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-launcher-surface border border-launcher-border rounded-xl overflow-hidden transition-all hover:border-launcher-primary/30">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-launcher-elevated flex items-center justify-center">
            <Package className="w-5 h-5 text-launcher-primary" />
          </div>
          <div>
            <p className="text-sm font-bold text-launcher-text font-mono">{version}</p>
            <p className="text-[10px] text-launcher-muted">
              {installed.length > 0
                ? `${installed.length} загрузчик(ов) установлено`
                : 'Не установлено'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1.5 rounded-md text-launcher-muted hover:text-launcher-text hover:bg-launcher-elevated transition-colors"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {expanded && (
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
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-launcher-primary/10 text-launcher-primary text-xs font-medium hover:bg-launcher-primary/20 transition-colors"
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
