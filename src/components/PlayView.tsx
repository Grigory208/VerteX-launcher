import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useInstalledVersions } from '@/hooks/useInstalledVersions';
import type { Client, Modpack } from '@/types';
import {
  Play, Settings2, Cpu, MemoryStick, HardDrive, Monitor, CheckCircle2, Download, Info, AlertTriangle, Layers, Package, RefreshCw, FolderUp, Trash2, ChevronDown
} from 'lucide-react';
import { SettingsModal } from '@/components/SettingsModal';

interface PlayViewProps {
  auth: ReturnType<typeof useAuth>;
  onInstalledChange: () => void;
}

interface HardwareInfo { cpu: string; ram: string; disk: string; gpu: string; }

const FALLBACK_HARDWARE: HardwareInfo = { cpu: 'Определение...', ram: 'Определение...', disk: 'Определение...', gpu: 'Определение...' };
const MC_VERSIONS_STORAGE = 'vertex-installed-versions';
const SETTINGS_KEY = 'vertex-launcher-settings';
const LAST_PLAYED_KEY = 'vertex-last-played';

interface InstalledMCVersion { version: string; loader: string; folderName: string; installedAt: string; }

function getInstalledMcVersions(): InstalledMCVersion[] {
  try {
    const raw = localStorage.getItem(MC_VERSIONS_STORAGE);
    return raw ? (JSON.parse(raw) as InstalledMCVersion[]) : [];
  } catch { return []; }
}

function readLauncherSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { memoryMb: 4096, javaPath: '', javaArgs: '', gamePath: '' };
    return JSON.parse(raw);
  } catch { return { memoryMb: 4096, javaPath: '', javaArgs: '', gamePath: '' }; }
}

export function PlayView({ auth, onInstalledChange }: PlayViewProps) {
  const { getInstalled } = useInstalledVersions();
  const [clients, setClients] = useState<Client[]>([]);
  const [modpacks, setModpacks] = useState<Modpack[]>([]);
  const [importedPacks, setImportedPacks] = useState<any[]>([]);
  
  const [activeTab, setActiveTab] = useState<'versions' | 'builds'>('versions');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [launching, setLaunching] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [launchError, setLaunchError] = useState('');
  
  const [refreshKey, setRefreshKey] = useState(0);
  const [hardware, setHardware] = useState<HardwareInfo>(FALLBACK_HARDWARE);
  const [showSettings, setShowSettings] = useState(false);
  
  const [installedMcVersions, setInstalledMcVersions] = useState<InstalledMCVersion[]>(getInstalledMcVersions());
  const [selectedMcVersion, setSelectedMcVersion] = useState<string>(() => localStorage.getItem(LAST_PLAYED_KEY) || '');
  const [isVersionsOpen, setIsVersionsOpen] = useState(false);
  const [isBuildsOpen, setIsBuildsOpen] = useState(false);

  useEffect(() => {
    const api = (window as unknown as { electronAPI?: { getHardwareInfo: () => Promise<HardwareInfo> } }).electronAPI;
    if (api?.getHardwareInfo) {
      api.getHardwareInfo().then(setHardware).catch(() => setHardware({ cpu: 'Недоступно', ram: 'Недоступно', disk: 'Недоступно', gpu: 'Недоступно' }));
    }
  }, []);

  const syncWithDisk = useCallback(async () => {
    const settings = readLauncherSettings();
    const api = (window as any).electronAPI;
    if (!api?.scanInstalledVersions) return;

    const diskVersions: any[] | null = await api.scanInstalledVersions({ gamePath: settings.gamePath });
    if (!diskVersions) return; 

    const storedVersions = localStorage.getItem(MC_VERSIONS_STORAGE);
    let localVersions: InstalledMCVersion[] = storedVersions ? JSON.parse(storedVersions) : [];
    
    const syncedVersions: InstalledMCVersion[] = [];
    const now = Date.now();

    for (const v of localVersions) {
      const onDisk = diskVersions.find((d: any) => d.folderName === v.folderName || (d.version === v.version && d.loader === v.loader));
      if (onDisk) {
        syncedVersions.push({ ...v, folderName: onDisk.folderName });
      } else {
        const addedTime = new Date(v.installedAt).getTime();
        if (now - addedTime < 20000) {
          syncedVersions.push(v); 
        }
      }
    }

    for (const d of diskVersions) {
      const exists = syncedVersions.find(v => v.folderName === d.folderName || (v.version === d.version && v.loader === d.loader));
      if (!exists) {
        syncedVersions.push({ version: d.version, loader: d.loader, folderName: d.folderName, installedAt: new Date().toISOString() });
      }
    }

    const localStr = JSON.stringify(localVersions.map(v => v.folderName).sort());
    const syncStr = JSON.stringify(syncedVersions.map(v => v.folderName).sort());

    if (localStr !== syncStr) {
      localStorage.setItem(MC_VERSIONS_STORAGE, JSON.stringify(syncedVersions));
      setInstalledMcVersions(syncedVersions);
      
      if (syncedVersions.length > 0 && (!selectedMcVersion || !syncedVersions.find(v => `${v.version}|${v.loader}` === selectedMcVersion))) {
        setSelectedMcVersion(`${syncedVersions[0].version}|${syncedVersions[0].loader}`);
      } else if (syncedVersions.length === 0) {
        setSelectedMcVersion('');
      }
    }

    const importedList = JSON.parse(localStorage.getItem('vertex-imported-modpacks') || '[]');
    const diskFolders = diskVersions.map((d: any) => d.folderName);
    
    const validImported = importedList.filter((p: any) => {
      if (diskFolders.includes(p.name)) return true;
      const addedTime = new Date(p.importedAt).getTime();
      return (now - addedTime < 20000); 
    });
    
    if (validImported.length !== importedList.length) {
      localStorage.setItem('vertex-imported-modpacks', JSON.stringify(validImported));
      setImportedPacks(validImported);
      if (selectedId?.startsWith('imported_') && !validImported.find((p: any) => p.id === selectedId.replace('imported_', ''))) {
        setSelectedId(null);
      }
    }
  }, [selectedMcVersion, importedPacks, selectedId]);

  useEffect(() => {
    syncWithDisk();
    const interval = setInterval(syncWithDisk, 3000);
    window.addEventListener('focus', syncWithDisk);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', syncWithDisk);
    };
  }, [syncWithDisk]);

  const fetchData = useCallback(async () => {
    const [clientsRes, modpacksRes] = await Promise.all([
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('modpacks').select('*').order('updated_at', { ascending: false })
    ]);
    
    const clientsList = (clientsRes.data as Client[]) ?? [];
    const modpacksList = (modpacksRes.data as Modpack[]) ?? [];
    const importedList = JSON.parse(localStorage.getItem('vertex-imported-modpacks') || '[]');
    
    setClients(clientsList);
    setModpacks(modpacksList);
    setImportedPacks(importedList);
    
    setSelectedId((prev) => {
      if (prev) return prev;
      if (clientsList.length > 0) return `client_${clientsList[0].id}`;
      if (modpacksList.length > 0) return `modpack_${modpacksList[0].id}`;
      if (importedList.length > 0) return `imported_${importedList[0].id}`;
      return null;
    });
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (installedMcVersions.length === 0 && (clients.length > 0 || modpacks.length > 0 || importedPacks.length > 0)) {
      setActiveTab('builds');
    }
  }, [installedMcVersions, clients, modpacks, importedPacks]);

  const isClient = selectedId?.startsWith('client_');
  const isModpack = selectedId?.startsWith('modpack_');
  const isImported = selectedId?.startsWith('imported_');
  
  const selectedClient = isClient ? clients.find(c => `client_${c.id}` === selectedId) : null;
  const selectedModpack = isModpack ? modpacks.find(m => `modpack_${m.id}` === selectedId) : null;
  const selectedImported = isImported ? importedPacks.find(m => `imported_${m.id}` === selectedId) : null;

  const installedVersion = selectedClient ? getInstalled(selectedClient.id) : null;
  const needsUpdate = installedVersion !== null && installedVersion !== selectedClient?.version;
  const isInstalled = installedVersion !== null;

  const hasInstalledMcVersion = installedMcVersions.length > 0;
  const canPlay = activeTab === 'versions' ? hasInstalledMcVersion : !!selectedModpack || !!selectedImported || (selectedClient && isInstalled && !needsUpdate);
  const displayName = auth.session ? (auth.profile?.username ?? 'Игрок') : 'Guest';

  const handleDeleteVersion = async (folderName: string, displayName: string) => {
    if (!confirm(`Вы уверены, что хотите удалить "${displayName}"? Папка "${folderName}" будет стёрта.`)) return;
    const settings = readLauncherSettings();
    const api = (window as any).electronAPI;

    const filtered = installedMcVersions.filter(v => v.folderName !== folderName);
    localStorage.setItem(MC_VERSIONS_STORAGE, JSON.stringify(filtered));
    setInstalledMcVersions(filtered);
    if (selectedMcVersion === displayName || !filtered.find(v => `${v.version}|${v.loader}` === selectedMcVersion)) {
      setSelectedMcVersion(filtered.length > 0 ? `${filtered[0].version}|${filtered[0].loader}` : '');
    }

    const importedList = JSON.parse(localStorage.getItem('vertex-imported-modpacks') || '[]');
    const filteredImported = importedList.filter((p: any) => p.name !== folderName);
    if (importedList.length !== filteredImported.length) {
      localStorage.setItem('vertex-imported-modpacks', JSON.stringify(filteredImported));
      setImportedPacks(filteredImported);
    }

    const res = await api.deleteVersion({ versionId: folderName, gamePath: settings.gamePath });
    if (!res.success) {
      alert('Ошибка удаления с диска: ' + res.error);
      syncWithDisk();
    }
  };

  const handleDeleteBuild = async (id: string, type: 'modpack' | 'imported', name: string) => {
    if (!confirm(`Удалить сборку "${name}"?`)) return;
    const settings = readLauncherSettings();
    const api = (window as any).electronAPI;

    if (type === 'modpack') {
      const { error } = await supabase.from('modpacks').delete().eq('id', id);
      if (!error) {
        setModpacks(prev => prev.filter(m => m.id !== id));
        if (selectedId === `modpack_${id}`) setSelectedId(null);
      } else {
        alert('Не удалось удалить сборку из базы данных');
      }
    } else if (type === 'imported') {
      const filtered = importedPacks.filter(p => p.id !== id);
      localStorage.setItem('vertex-imported-modpacks', JSON.stringify(filtered));
      setImportedPacks(filtered);
      if (selectedId === `imported_${id}`) setSelectedId(null);
      await api.deleteVersion({ versionId: name, gamePath: settings.gamePath });
    }
  };

  const handleDownloadBuild = async () => {
    if (!selectedClient || !selectedClient.download_url) {
      alert('У этой сборки нет ссылки на скачивание.');
      return;
    }
    
    setDownloading(true);
    setLaunchError('');
    const settings = readLauncherSettings();

    try {
      const result = await (window as any).electronAPI.installModpack({
        url: selectedClient.download_url,
        gamePath: settings.gamePath
      });

      if (result.success) {
        const stored = localStorage.getItem(MC_VERSIONS_STORAGE);
        const versions = stored ? JSON.parse(stored) : [];
        const existingIndex = versions.findIndex((v: any) => v.id === selectedClient.id);
        const newEntry = { id: selectedClient.id, version: selectedClient.version, installedAt: new Date().toISOString() };
        
        if (existingIndex >= 0) versions[existingIndex] = newEntry;
        else versions.push(newEntry);
        
        localStorage.setItem(MC_VERSIONS_STORAGE, JSON.stringify(versions));
        setRefreshKey(prev => prev + 1);
        syncWithDisk();
        if (onInstalledChange) onInstalledChange();
      } else {
        setLaunchError(`Ошибка скачивания: ${result.error}`);
      }
    } catch (err: any) {
      setLaunchError(`Ошибка: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };

  const handlePlay = async () => {
    setLaunching(true);
    setLaunched(false);
    setLaunchError('');

    let mcVersion = '';
    let currentLoader = 'vanilla';
    let loaderVersionToPass: string | undefined = undefined;
    let packMemory = 4096;
    let packJavaArgs = '';
    let importedPackName = undefined;

    if (activeTab === 'builds') {
      if (selectedClient) {
        mcVersion = selectedClient.version;
        const clientName = selectedClient.name?.toLowerCase() || '';
        if (clientName.includes('neoforge')) currentLoader = 'neoforge';
        else if (clientName.includes('forge')) currentLoader = 'forge';
        else if (clientName.includes('quilt')) currentLoader = 'quilt';
        else if (clientName.includes('fabric')) currentLoader = 'fabric';
      } else if (selectedModpack) {
        mcVersion = selectedModpack.mc_version;
        currentLoader = selectedModpack.loader;
        packMemory = selectedModpack.memory;
        packJavaArgs = selectedModpack.java_args;
      } else if (selectedImported) {
        mcVersion = selectedImported.mc_version;
        currentLoader = selectedImported.loader;
        importedPackName = selectedImported.name;
      } else {
        setLaunching(false);
        return;
      }
    } else {
      const parts = selectedMcVersion.split('|');
      mcVersion = parts[0] ?? installedMcVersions[0].version;
      currentLoader = parts[1] ? parts[1].toLowerCase() : installedMcVersions[0].loader.toLowerCase();
      
      localStorage.setItem(LAST_PLAYED_KEY, selectedMcVersion);
    }

    if (currentLoader === 'fabric') {
      loaderVersionToPass = '0.16.5';
      if (mcVersion.startsWith('1.12') || mcVersion.startsWith('1.16')) loaderVersionToPass = '0.15.11';
    }

    // Активный скин игрока из Supabase -> в запуск (ресурсупаковка собирается в main.cjs)
    let skinUrl: string | undefined = undefined;
    if (auth.session) {
      try {
        const { data: skinRow } = await supabase
          .from('skins')
          .select('skin_url')
          .eq('user_id', auth.session.user.id)
          .eq('active', true)
          .maybeSingle();
        skinUrl = skinRow?.skin_url ?? undefined;
      } catch { /* нет скина — игра стартует с дефолтным */ }
    }

    const settings = readLauncherSettings();
    const api = (window as any).electronAPI;

    try {
      if (selectedModpack) {
        const installResult = await api.installCustomModpack({
          mods: selectedModpack.mods, mcVersion: selectedModpack.mc_version, loader: selectedModpack.loader, gamePath: settings.gamePath
        });
        if (!installResult.success) throw new Error(`Ошибка установки модов: ${installResult.error}`);
      }

      const result = await api.launchMinecraft({
        version: mcVersion, username: displayName,
        memory: selectedModpack ? packMemory : (settings.memoryMb || 4096),
        loader: currentLoader, loaderVersion: loaderVersionToPass,
        javaPath: settings.javaPath, javaArgs: selectedModpack ? packJavaArgs : settings.javaArgs,
        gamePath: settings.gamePath,
        importedPackName: importedPackName,
        skinUrl: skinUrl
      });

      if (result.success) {
        setLaunched(true);
        setTimeout(() => setLaunched(false), 5000);
      } else {
        setLaunchError(result.error ?? 'Не удалось запустить игру');
      }
    } catch (err: any) {
      setLaunchError(err.message || 'Ошибка запуска');
    } finally {
      setLaunching(false);
    }
  };

  const selectedVersionObj = installedMcVersions.find(v => `${v.version}|${v.loader}` === selectedMcVersion);
  const currentMcDisplay = selectedVersionObj ? `${selectedVersionObj.version} — ${selectedVersionObj.loader}` : 'Выберите версию...';

  const allBuilds = [
    ...clients.map(c => ({ id: `client_${c.id}`, name: c.name, desc: getInstalled(c.id) ? `v${c.version}` : 'не установлен', type: 'client', data: c })),
    ...modpacks.map(m => ({ id: `modpack_${m.id}`, name: m.name, desc: `${m.loader} · ${m.mc_version}`, type: 'modpack', data: m })),
    ...importedPacks.map(m => ({ id: `imported_${m.id}`, name: m.name, desc: `${m.loader} · ${m.mc_version}`, type: 'imported', data: m }))
  ];
  const selectedBuildObj = allBuilds.find(b => b.id === selectedId);
  const currentBuildDisplay = selectedBuildObj ? `${selectedBuildObj.name} (${selectedBuildObj.desc})` : 'Выберите сборку...';

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
                  <span className="inline-block mt-2 text-xs text-launcher-danger bg-launcher-danger/10 px-3 py-1 rounded-full border border-launcher-danger/30">Администратор</span>
                )}
              </div>

              <div className="flex justify-center mb-8">
                <div className="flex bg-launcher-surface border border-launcher-border p-1.5 rounded-xl shadow-lg">
                  <button onClick={() => setActiveTab('versions')} className={`px-8 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'versions' ? 'bg-launcher-primary text-launcher-bg shadow-md' : 'text-launcher-muted hover:text-launcher-text hover:bg-launcher-elevated/50'}`}>Версии</button>
                  <button onClick={() => setActiveTab('builds')} className={`px-8 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === 'builds' ? 'bg-launcher-primary text-launcher-bg shadow-md' : 'text-launcher-muted hover:text-launcher-text hover:bg-launcher-elevated/50'}`}>Сборки</button>
                </div>
              </div>

              <div className="w-full max-w-md mb-8 relative">
                {activeTab === 'versions' ? (
                  hasInstalledMcVersion ? (
                    <div className="animate-fade-in">
                      <label className="flex items-center justify-center gap-2 text-xs text-launcher-muted uppercase tracking-wide mb-2"><Layers className="w-3.5 h-3.5" /> Версия Minecraft</label>
                      <div className="relative">
                        <button onClick={() => setIsVersionsOpen(!isVersionsOpen)} className="w-full bg-launcher-surface border border-launcher-border rounded-xl px-5 py-3.5 text-launcher-text font-display text-lg focus:border-launcher-primary outline-none transition-colors flex items-center justify-between shadow-lg">
                          <span className="truncate">{currentMcDisplay}</span>
                          <ChevronDown className={`w-5 h-5 transition-transform ${isVersionsOpen ? 'rotate-180' : ''}`} />
                        </button>
                        
                        {isVersionsOpen && (
                          <div className="absolute top-full left-0 right-0 mt-2 bg-launcher-surface border border-launcher-border rounded-xl shadow-2xl z-50 max-h-64 overflow-y-auto scrollbar-thin">
                            {installedMcVersions.map((v) => {
                              const isSel = selectedMcVersion === `${v.version}|${v.loader}`;
                              return (
                                <div 
                                  key={v.folderName} 
                                  className={`flex items-center justify-between p-3 border-b border-launcher-border last:border-0 hover:bg-launcher-elevated transition-colors ${isSel ? 'bg-launcher-primary/10' : ''}`}
                                >
                                  <div 
                                    onClick={() => { setSelectedMcVersion(`${v.version}|${v.loader}`); setIsVersionsOpen(false); }}
                                    className="flex-1 cursor-pointer flex items-center gap-3"
                                  >
                                    <div className={`w-3 h-3 rounded-full ${isSel ? 'bg-launcher-primary' : 'bg-launcher-border'}`} />
                                    <span className="font-bold text-launcher-text">{v.version}</span>
                                    <span className="text-[10px] text-launcher-muted uppercase bg-launcher-bg px-1.5 py-0.5 rounded">{v.loader}</span>
                                  </div>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleDeleteVersion(v.folderName, `${v.version} (${v.loader})`); }}
                                    className="p-1.5 rounded-lg text-launcher-danger hover:bg-launcher-danger/20 transition-colors"
                                    title="Удалить версию"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 animate-fade-in">
                      <Layers className="w-10 h-10 mx-auto mb-3 text-launcher-muted opacity-40" />
                      <p className="text-sm text-launcher-muted">У вас пока нет установленных версий.</p>
                      <p className="text-xs text-launcher-muted mt-1">Перейдите в раздел «Версии MC», чтобы установить игру.</p>
                    </div>
                  )
                ) : (
                  allBuilds.length > 0 ? (
                    <div className="animate-fade-in">
                      <label className="flex items-center justify-center gap-2 text-xs text-launcher-muted uppercase tracking-wide mb-2"><Package className="w-3.5 h-3.5" /> Выберите сборку</label>
                      <div className="relative">
                        <button onClick={() => setIsBuildsOpen(!isBuildsOpen)} className="w-full bg-launcher-surface border border-launcher-border rounded-xl px-5 py-3.5 text-launcher-text font-display text-lg focus:border-launcher-primary outline-none transition-colors flex items-center justify-between shadow-lg">
                          <span className="truncate">{currentBuildDisplay}</span>
                          <ChevronDown className={`w-5 h-5 transition-transform ${isBuildsOpen ? 'rotate-180' : ''}`} />
                        </button>
                        
                        {isBuildsOpen && (
                          <div className="absolute top-full left-0 right-0 mt-2 bg-launcher-surface border border-launcher-border rounded-xl shadow-2xl z-50 max-h-64 overflow-y-auto scrollbar-thin">
                            {allBuilds.map((b) => {
                              const isSel = selectedId === b.id;
                              return (
                                <div 
                                  key={b.id} 
                                  className={`flex items-center justify-between p-3 border-b border-launcher-border last:border-0 hover:bg-launcher-elevated transition-colors ${isSel ? 'bg-launcher-primary/10' : ''}`}
                                >
                                  <div 
                                    onClick={() => { setSelectedId(b.id); setIsBuildsOpen(false); }}
                                    className="flex-1 cursor-pointer"
                                  >
                                    <p className="font-bold text-launcher-text text-sm">{b.name}</p>
                                    <p className="text-xs text-launcher-muted">{b.desc}</p>
                                  </div>
                                  {b.type !== 'client' && (
                                    <button 
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        if (b.type === 'modpack') handleDeleteBuild(b.data.id, 'modpack', b.name);
                                        else handleDeleteBuild(b.data.id, 'imported', b.name);
                                      }}
                                      className="p-1.5 rounded-lg text-launcher-danger hover:bg-launcher-danger/20 transition-colors"
                                      title="Удалить сборку"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      
                      {selectedClient && (
                        <div className="mt-3 flex items-center justify-center gap-4 text-sm">
                          {isInstalled && !needsUpdate && (<span className="flex items-center gap-1.5 text-launcher-primary"><CheckCircle2 className="w-4 h-4" /> Установлено v{installedVersion}</span>)}
                          {needsUpdate && (<span className="flex items-center gap-1.5 text-launcher-warning"><RefreshCw className="w-4 h-4" /> Доступно обновление: v{selectedClient.version}</span>)}
                          {!isInstalled && (<span className="flex items-center gap-1.5 text-launcher-muted"><Info className="w-4 h-4" /> Требуется скачивание</span>)}
                        </div>
                      )}
                      {selectedModpack && (<div className="mt-3 flex items-center justify-center gap-4 text-sm text-launcher-primary"><Package className="w-4 h-4" /> <span>{selectedModpack.mods?.length || 0} модов</span></div>)}
                      {selectedImported && (<div className="mt-3 flex items-center justify-center gap-4 text-sm text-launcher-primary"><FolderUp className="w-4 h-4" /> <span>Импортировано в versions</span></div>)}
                    </div>
                  ) : (
                    <div className="text-center py-6 animate-fade-in"><Package className="w-10 h-10 mx-auto mb-3 text-launcher-muted opacity-40" /><p className="text-sm text-launcher-muted">Нет доступных сборок.</p></div>
                  )
                )}
              </div>

              {launchError && (
                <div className="mb-6 flex items-center gap-2.5 px-4 py-3 rounded-lg bg-launcher-danger/10 text-launcher-danger border border-launcher-danger/30 max-w-md animate-fade-in">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" /><span className="text-sm">{launchError}</span>
                </div>
              )}

              {activeTab === 'builds' && selectedClient && !isInstalled ? (
                <button onClick={handleDownloadBuild} disabled={downloading} className="relative px-20 py-6 rounded-2xl font-display font-bold text-2xl transition-all duration-300 bg-launcher-primary text-launcher-bg hover:scale-105 animate-pulse-glow disabled:opacity-70 disabled:cursor-wait">
                  {downloading ? (<span className="flex items-center gap-3"><div className="w-6 h-6 border-2 border-launcher-bg/30 border-t-launcher-bg rounded-full animate-spin" /> СКАЧИВАНИЕ...</span>) : (<span className="flex items-center gap-3"><Download className="w-7 h-7" /> СКАЧАТЬ</span>)}
                </button>
              ) : activeTab === 'builds' && selectedClient && needsUpdate ? (
                <button onClick={handleDownloadBuild} disabled={downloading} className="relative px-20 py-6 rounded-2xl font-display font-bold text-2xl transition-all duration-300 bg-launcher-warning text-launcher-bg hover:scale-105 disabled:opacity-70">
                  {downloading ? (<span className="flex items-center gap-3"><div className="w-6 h-6 border-2 border-launcher-bg/30 border-t-launcher-bg rounded-full animate-spin" /> ОБНОВЛЕНИЕ...</span>) : (<span className="flex items-center gap-3"><RefreshCw className="w-7 h-7" /> ОБНОВИТЬ</span>)}
                </button>
              ) : (
                <button onClick={handlePlay} disabled={!canPlay || launching} className={`relative px-20 py-6 rounded-2xl font-display font-bold text-2xl transition-all duration-300 ${launched ? 'bg-launcher-accent text-white scale-95' : launching ? 'bg-launcher-warning text-launcher-bg cursor-wait' : canPlay ? 'bg-launcher-primary text-launcher-bg hover:scale-105 animate-pulse-glow' : 'bg-launcher-border text-launcher-muted cursor-not-allowed'}`}>
                  {launched ? (<span className="flex items-center gap-3"><CheckCircle2 className="w-7 h-7" /> ЗАПУЩЕНО</span>) : launching ? (<span className="flex items-center gap-3"><div className="w-6 h-6 border-2 border-launcher-bg/30 border-t-launcher-bg rounded-full animate-spin" /> ПОДГОТОВКА...</span>) : (<span className="flex items-center gap-3"><Play className="w-7 h-7 fill-current" /> ИГРАТЬ</span>)}
                </button>
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
          <button onClick={() => setShowSettings(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-launcher-elevated text-sm text-launcher-muted hover:text-launcher-text transition-colors"><Settings2 className="w-4 h-4" /> Настройки</button>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-launcher-primary/10 text-launcher-primary text-xs"><div className="w-2 h-2 rounded-full bg-launcher-primary animate-pulse" />Сервер: Online</div>
        </div>
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}