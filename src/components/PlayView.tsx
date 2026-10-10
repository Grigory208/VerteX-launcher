import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useInstalledVersions } from '@/hooks/useInstalledVersions';
import type { Client } from '@/types';
import {
  Play,
  Settings2,
  Cpu,
  MemoryStick,
  HardDrive,
  Monitor,
  CheckCircle2,
  Download,
  Info,
  AlertTriangle,
  Layers,
} from 'lucide-react';
import { SettingsModal } from '@/components/SettingsModal';

interface PlayViewProps {
  auth: ReturnType<typeof useAuth>;
  onInstalledChange: () => void;
}

interface HardwareInfo {
  cpu: string;
  ram: string;
  disk: string;
  gpu: string;
}

const FALLBACK_HARDWARE: HardwareInfo = {
  cpu: 'Определение...',
  ram: 'Определение...',
  disk: 'Определение...',
  gpu: 'Определение...',
};

const MC_VERSIONS_STORAGE = 'vertex-installed-versions';

interface InstalledMCVersion {
  version: string;
  loader: string;
  installedAt: string;
}

function getInstalledMcVersions(): InstalledMCVersion[] {
  try {
    const raw = localStorage.getItem(MC_VERSIONS_STORAGE);
    return raw ? (JSON.parse(raw) as InstalledMCVersion[]) : [];
  } catch {
    return [];
  }
}

const SETTINGS_KEY = 'vertex-launcher-settings';

function readMemorySetting(): number {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return 4096;
    const parsed = JSON.parse(raw) as { memoryMb?: number };
    return parsed.memoryMb ?? 4096;
  } catch {
    return 4096;
  }
}

export function PlayView({ auth }: PlayViewProps) {
  const { getInstalled } = useInstalledVersions();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [launchError, setLaunchError] = useState('');
  const [hardware, setHardware] = useState<HardwareInfo>(FALLBACK_HARDWARE);
  const [showSettings, setShowSettings] = useState(false);
  const [installedMcVersions, setInstalledMcVersions] = useState<InstalledMCVersion[]>(getInstalledMcVersions());
  const [selectedMcVersion, setSelectedMcVersion] = useState<string>('');
  const [browserHardware, setBrowserHardware] = useState<HardwareInfo | null>(null);

  useEffect(() => {
    const api = (window as unknown as { electronAPI?: { getHardwareInfo: () => Promise<HardwareInfo> } }).electronAPI;
    if (api?.getHardwareInfo) {
      api.getHardwareInfo().then((info) => {
        setHardware(info);
      }).catch(() => {
        setHardware({ cpu: 'Недоступно', ram: 'Недоступно', disk: 'Недоступно', gpu: 'Недоступно' });
      });
    } else {
      detectBrowserHardware().then((info) => {
        setHardware(info);
        setBrowserHardware(info);
      });
    }
  }, []);

  useEffect(() => {
    const handler = () => setInstalledMcVersions(getInstalledMcVersions());
    window.addEventListener('storage', handler);
    window.addEventListener('focus', handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('focus', handler);
    };
  }, []);

  const fetchClients = useCallback(async () => {
    const { data } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });
    const list = (data as Client[]) ?? [];
    setClients(list);
    setSelectedId((prev) => {
      if (prev) return prev;
      if (list.length === 0) return null;
      const firstInstalled = list.find((c) => getInstalled(c.id) !== null);
      return (firstInstalled ?? list[0]).id;
    });
    setLoading(false);
  }, [getInstalled]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    if (installedMcVersions.length > 0 && !selectedMcVersion) {
      setSelectedMcVersion(`${installedMcVersions[0].version}|${installedMcVersions[0].loader}`);
    }
  }, [installedMcVersions, selectedMcVersion]);

  const selectedClient = clients.find((c) => c.id === selectedId) ?? null;
  const installedVersion = selectedClient ? getInstalled(selectedClient.id) : null;
  const needsUpdate = installedVersion !== null && installedVersion !== selectedClient?.version;
  const isInstalled = installedVersion !== null;

  const hasInstalledMcVersion = installedMcVersions.length > 0;
  const canPlay = (clients.length > 0 && isInstalled && !needsUpdate) || hasInstalledMcVersion;

  const displayName = auth.session ? (auth.profile?.username ?? 'Игрок') : 'Guest';

  const handlePlay = async () => {
    setLaunching(true);
    setLaunched(false);
    setLaunchError('');

    let mcVersion: string;

    if (clients.length > 0 && isInstalled && !needsUpdate && selectedClient) {
      mcVersion = selectedClient.version;
    } else if (hasInstalledMcVersion) {
      const parts = selectedMcVersion.split('|');
      mcVersion = parts[0] ?? installedMcVersions[0].version;
    } else {
      setLaunching(false);
      setLaunchError('Нет установленной версии для запуска');
      return;
    }

    const memory = readMemorySetting();

    const api = (window as unknown as {
      electronAPI?: {
        launchMinecraft: (args: { 
          version: string; 
          username: string; 
          memory: number;
          loader?: string;
          loaderVersion?: string;
        }) => Promise<{ success: boolean; error?: string; pid?: number }>;
      }
    }).electronAPI;

    if (!api?.launchMinecraft) {
      setLaunching(false);
      setLaunchError('Запуск игры доступен только в десктопном приложении. Установите VERTEX Launcher на компьютер для запуска Minecraft.');
      return;
    }

    try {
      // Узнаем, использует ли выбранная сборка или версия Fabric лоадер
      const isFabric = selectedClient?.name?.toLowerCase().includes('fabric') || selectedMcVersion.toLowerCase().includes('fabric');

      // Умный подбор лоадера: если игра старая (1.12.x или 1.16.x), ставим лоадер 0.15.11
      let fabricVersion = '0.16.5';
      if (mcVersion.startsWith('1.12') || mcVersion.startsWith('1.16')) {
        fabricVersion = '0.15.11';
      }

      // Если в базе Supabase у клиента будет прописано конкретное поле лоадера, возьмем его
      const currentLoaderVersion = (selectedClient as any)?.loader_version || fabricVersion;

      const result = await api.launchMinecraft({
        version: mcVersion,
        username: displayName,
        memory,
        loader: isFabric ? 'fabric' : 'vanilla',
        loaderVersion: isFabric ? currentLoaderVersion : undefined
      });


      if (result.success) {
        setLaunched(true);
        setLaunching(false);
        setTimeout(() => setLaunched(false), 5000);
      } else {
        setLaunching(false);
        setLaunchError(result.error ?? 'Не удалось запустить игру');
      }
    } catch (err) {
      setLaunching(false);
      setLaunchError(err instanceof Error ? err.message : 'Ошибка запуска');
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-launcher-bg/50 to-launcher-bg" />

        <div className="relative h-full flex flex-col items-center justify-center p-8 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="w-12 h-12 border-2 border-launcher-border border-t-launcher-primary rounded-full animate-spin" />
          ) : (
            <>
              <div className="mb-8 text-center">
                <p className="text-launcher-muted text-sm uppercase tracking-[0.3em] mb-2">Текущий профиль</p>
                <h1 className="text-5xl font-bold text-launcher-text font-display text-glow">{displayName}</h1>
                {auth.isAdmin && (
                  <span className="inline-block mt-2 text-xs text-launcher-danger bg-launcher-danger/10 px-3 py-1 rounded-full border border-launcher-danger/30">
                    Администратор
                  </span>
                )}
              </div>

              {clients.length > 0 && (
                <div className="mb-6 w-full max-w-md">
                  <label className="block text-xs text-launcher-muted uppercase tracking-wide mb-2 text-center">Сборка из каталога</label>
                  <div className="relative">
                    <select
                      value={selectedId ?? ''}
                      onChange={(e) => setSelectedId(e.target.value)}
                      className="w-full bg-launcher-surface border border-launcher-border rounded-xl px-5 py-3.5 text-launcher-text font-display text-lg focus:border-launcher-primary focus:outline-none transition-colors appearance-none cursor-pointer text-center"
                    >
                      {clients.map((c) => {
                        const iv = getInstalled(c.id);
                        const status = iv === null ? 'не установлен' : iv !== c.version ? `обновление до v${c.version}` : `v${iv}`;
                        return (
                          <option key={c.id} value={c.id}>
                            {c.name} — {status}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  {selectedClient && (
                    <div className="mt-3 flex items-center justify-center gap-4 text-sm">
                      {isInstalled && !needsUpdate && (
                        <span className="flex items-center gap-1.5 text-launcher-primary">
                          <CheckCircle2 className="w-4 h-4" /> Установлено v{installedVersion}
                        </span>
                      )}
                      {needsUpdate && (
                        <span className="flex items-center gap-1.5 text-launcher-warning">
                          <Download className="w-4 h-4" /> Доступно обновление: v{selectedClient.version}
                        </span>
                      )}
                      {!isInstalled && (
                        <span className="flex items-center gap-1.5 text-launcher-muted">
                          <Info className="w-4 h-4" /> Сборка не установлена — скачайте в каталоге
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {hasInstalledMcVersion && (
                <div className="mb-6 w-full max-w-md">
                  <label className="flex items-center justify-center gap-2 text-xs text-launcher-muted uppercase tracking-wide mb-2">
                    <Layers className="w-3.5 h-3.5" /> Установленная версия Minecraft
                  </label>
                  <div className="relative">
                    <select
                      value={selectedMcVersion}
                      onChange={(e) => setSelectedMcVersion(e.target.value)}
                      className="w-full bg-launcher-surface border border-launcher-border rounded-xl px-5 py-3.5 text-launcher-text font-display text-lg focus:border-launcher-primary focus:outline-none transition-colors appearance-none cursor-pointer text-center"
                    >
                      {installedMcVersions.map((v) => (
                        <option key={`${v.version}|${v.loader}`} value={`${v.version}|${v.loader}`}>
                          {v.version} — {v.loader}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {launchError && (
                <div className="mb-6 flex items-center gap-2.5 px-4 py-3 rounded-lg bg-launcher-danger/10 text-launcher-danger border border-launcher-danger/30 max-w-md animate-fade-in">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">{launchError}</span>
                </div>
              )}

              <button
                onClick={handlePlay}
                disabled={!canPlay || launching}
                className={`
                  relative px-20 py-6 rounded-2xl font-display font-bold text-2xl transition-all duration-300
                  ${launched
                    ? 'bg-launcher-accent text-white scale-95'
                    : launching
                    ? 'bg-launcher-warning text-launcher-bg cursor-wait'
                    : canPlay
                    ? 'bg-launcher-primary text-launcher-bg hover:scale-105 animate-pulse-glow'
                    : 'bg-launcher-border text-launcher-muted cursor-not-allowed'
                  }
                `}
              >
                {launched ? (
                  <span className="flex items-center gap-3"><CheckCircle2 className="w-7 h-7" /> ЗАПУЩЕНО</span>
                ) : launching ? (
                  <span className="flex items-center gap-3">
                    <div className="w-6 h-6 border-2 border-launcher-bg/30 border-t-launcher-bg rounded-full animate-spin" />
                    ЗАПУСК...
                  </span>
                ) : (
                  <span className="flex items-center gap-3"><Play className="w-7 h-7 fill-current" /> ИГРАТЬ</span>
                )}
              </button>

              {!canPlay && clients.length === 0 && !hasInstalledMcVersion && (
                <p className="mt-4 text-xs text-launcher-muted text-center">
                  Установите версию в разделе «Версии MC» или скачайте сборку в каталоге
                </p>
              )}
              {clients.length > 0 && !isInstalled && !hasInstalledMcVersion && (
                <p className="mt-4 text-xs text-launcher-muted">Сначала скачайте сборку в каталоге</p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="bg-launcher-surface border-t border-launcher-border px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs text-launcher-muted">
          <span className="flex items-center gap-2" title={hardware.cpu}><Cpu className="w-4 h-4 flex-shrink-0" /> <span className="hidden sm:inline">CPU:</span> {hardware.cpu}</span>
          <span className="flex items-center gap-2"><MemoryStick className="w-4 h-4 flex-shrink-0" /> <span className="hidden sm:inline">RAM:</span> {hardware.ram}</span>
          <span className="flex items-center gap-2"><HardDrive className="w-4 h-4 flex-shrink-0" /> <span className="hidden sm:inline">Disk:</span> {hardware.disk}</span>
          <span className="flex items-center gap-2"><Monitor className="w-4 h-4 flex-shrink-0" /> <span className="hidden sm:inline">GPU:</span> {hardware.gpu}</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowSettings(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-launcher-elevated text-sm text-launcher-muted hover:text-launcher-text transition-colors">
            <Settings2 className="w-4 h-4" /> Настройки
          </button>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-launcher-primary/10 text-launcher-primary text-xs">
            <div className="w-2 h-2 rounded-full bg-launcher-primary animate-pulse" />
            Сервер: Online
          </div>
        </div>
      </div>
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

async function detectBrowserHardware(): Promise<HardwareInfo> {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    userAgentData?: { platform?: string };
  };

  const cpuCores = navigator.hardwareConcurrency ?? 0;
  const ram = nav.deviceMemory ? `${nav.deviceMemory} ГБ` : 'Недоступно';
  const ua = navigator.userAgent;

  let cpu = 'Недоступно';
  if (ua.includes('Win')) cpu = `Windows (${cpuCores} ядер)`;
  else if (ua.includes('Mac')) cpu = `macOS (${cpuCores} ядер)`;
  else if (ua.includes('Linux')) cpu = `Linux (${cpuCores} ядер)`;
  else cpu = `${cpuCores} ядер`;

  const canvas = document.createElement('canvas');
  const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
  let gpu = 'Недоступно';
  if (gl) {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
    } else {
      gpu = gl.getParameter(gl.RENDERER) as string;
    }
  }

  let disk = 'Недоступно';
  try {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const total = estimate.quota ?? 0;
      if (total > 0) {
        disk = `${(total / 1024 / 1024 / 1024).toFixed(0)} ГБ`;
      }
    }
  } catch {
    // keep default
  }

  return { cpu, ram, disk, gpu };
}
