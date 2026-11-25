import { useState, useEffect } from 'react';
import { FolderUp, Loader2, CheckCircle2, AlertTriangle, Folder, ChevronDown } from 'lucide-react';

const LOADERS = ['fabric', 'forge', 'quilt', 'neoforge'];

export function ImportView() {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<any>(null);

  // Состояния для импорта папок
  const [folderPath, setFolderPath] = useState('');
  const [folderName, setFolderName] = useState('');
  const [folderMcVersion, setFolderMcVersion] = useState('1.21.1');
  const [folderLoader, setFolderLoader] = useState('fabric');

  // ⬇️ ДИНАМИЧЕСКИЙ СПИСОК ВЕРСИЙ ⬇️
  const [mcVersions, setMcVersions] = useState<string[]>([]);

  useEffect(() => {
    const fetchVersions = async () => {
      try {
        const api = (window as any).electronAPI;
        if (api?.fetchMojangVersions) {
          const data = await api.fetchMojangVersions();
          const versionIds = data.map((v: any) => v.id);
          setMcVersions(versionIds);
        }
      } catch (e) {
        console.error('Ошибка загрузки версий:', e);
      }
    };
    fetchVersions();
  }, []);

  const saveImportedPack = (pack: any) => {
    const existingStr = localStorage.getItem('vertex-imported-modpacks') || '[]';
    const existing = JSON.parse(existingStr);
    existing.push(pack);
    localStorage.setItem('vertex-imported-modpacks', JSON.stringify(existing));
  };

  const handleImportZip = async () => {
    setImporting(true); setError(''); setSuccess(null);
    try {
      const settings = JSON.parse(localStorage.getItem('vertex-launcher-settings') || '{}');
      const result = await (window as any).electronAPI.selectAndImportModpack({ gamePath: settings.gamePath });
      
      if (result.canceled) return;
      if (result.success) { setSuccess(result.pack); saveImportedPack(result.pack); }
      else setError(result.error);
    } catch (err: any) {
      setError(err.message);
    } finally { setImporting(false); }
  };

  const chooseFolder = async () => {
    const electronApi = (window as any).electronAPI;
    if (!electronApi?.chooseGameFolder) return;
    const selected = await electronApi.chooseGameFolder();
    if (selected) {
      setFolderPath(selected);
      const name = selected.split(/[\\/]/).pop() || 'ImportedPack';
      setFolderName(name);
    }
  };

  const handleImportFolder = async () => {
    if (!folderPath || !folderName) {
      setError('Выберите папку и введите название');
      return;
    }
    setImporting(true); setError(''); setSuccess(null);
    try {
      const settings = JSON.parse(localStorage.getItem('vertex-launcher-settings') || '{}');
      const result = await (window as any).electronAPI.importFolderModpack({
        sourcePath: folderPath,
        packName: folderName,
        mcVersion: folderMcVersion,
        loader: folderLoader,
        gamePath: settings.gamePath
      });

      if (result.success) { setSuccess(result.pack); saveImportedPack(result.pack); setFolderPath(''); }
      else setError(result.error);
    } catch (err: any) {
      setError(err.message);
    } finally { setImporting(false); }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center p-8 overflow-y-auto scrollbar-thin">
      <div className="w-20 h-20 rounded-2xl bg-launcher-elevated flex items-center justify-center mb-6">
        <FolderUp className="w-10 h-10 text-launcher-primary" />
      </div>
      
      <h2 className="text-2xl font-bold text-launcher-text font-display mb-2">Импорт сборки</h2>
      
      {error && (
        <div className="mb-6 flex items-center gap-2.5 px-4 py-3 rounded-lg bg-launcher-danger/10 text-launcher-danger border border-launcher-danger/30 max-w-md w-full">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" /><span className="text-sm">{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-6 p-5 rounded-xl bg-launcher-primary/10 border border-launcher-primary/30 max-w-md w-full animate-fade-in">
          <div className="flex items-center gap-2 text-launcher-primary mb-2">
            <CheckCircle2 className="w-5 h-5" /><h3 className="font-bold">Сборка импортирована!</h3>
          </div>
          <p className="text-sm text-launcher-text mb-1">Название: <strong>{success.name}</strong></p>
          <p className="text-xs text-launcher-muted">Ищите её в разделе «Играть» &rarr; «Сборки».</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl w-full">
        {/* Блок 1: Импорт архива */}
        <div className="bg-launcher-surface border border-launcher-border rounded-xl p-6 flex flex-col">
          <h3 className="text-lg font-bold text-launcher-text mb-2">Импорт из архива</h3>
          <p className="text-sm text-launcher-muted mb-6 flex-1">
            Загрузите готовую сборку в формате <strong className="text-launcher-text">.mrpack</strong> (Modrinth) или <strong className="text-launcher-text">.zip</strong> (CurseForge).
          </p>
          <button onClick={handleImportZip} disabled={importing} className="w-full py-3 rounded-lg bg-launcher-primary text-launcher-bg font-bold text-sm hover:bg-launcher-primary-dim transition-colors flex items-center justify-center gap-2">
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderUp className="w-4 h-4" />} Выбрать ZIP-файл
          </button>
        </div>

        {/* Блок 2: Импорт папки */}
        <div className="bg-launcher-surface border border-launcher-border rounded-xl p-6 flex flex-col">
          <h3 className="text-lg font-bold text-launcher-text mb-2">Импорт из папки</h3>
          <p className="text-sm text-launcher-muted mb-4">
            Укажите папку с игрой (например, от TLauncher). Мы скопируем моды и конфиги.
          </p>
          
          <div className="space-y-3 mb-4">
            <div className="flex gap-2">
              <input value={folderPath} readOnly placeholder="Путь к папке..." className="flex-1 min-w-0 bg-launcher-bg border border-launcher-border rounded-lg px-3 py-2 text-xs text-launcher-text" />
              <button onClick={chooseFolder} className="px-3 py-2 rounded-lg bg-launcher-elevated text-xs hover:bg-launcher-border transition-colors"><Folder className="w-4 h-4" /></button>
            </div>
            <input value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="Название сборки" className="w-full bg-launcher-bg border border-launcher-border rounded-lg px-3 py-2 text-sm text-launcher-text" />
            
            <div className="flex gap-2">
              <div className="relative flex-1">
                <select value={folderMcVersion} onChange={(e) => setFolderMcVersion(e.target.value)} className="w-full appearance-none bg-launcher-bg border border-launcher-border rounded-lg pl-3 pr-8 py-2 text-sm text-launcher-text cursor-pointer">
                  {mcVersions.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-launcher-muted pointer-events-none" />
              </div>
              <div className="relative flex-1">
                <select value={folderLoader} onChange={(e) => setFolderLoader(e.target.value)} className="w-full appearance-none bg-launcher-bg border border-launcher-border rounded-lg pl-3 pr-8 py-2 text-sm text-launcher-text cursor-pointer">
                  {LOADERS.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-launcher-muted pointer-events-none" />
              </div>
            </div>
          </div>

          <button onClick={handleImportFolder} disabled={importing || !folderPath} className="w-full py-3 rounded-lg bg-launcher-elevated text-launcher-text border border-launcher-border font-bold text-sm hover:bg-launcher-border transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderUp className="w-4 h-4" />} Импортировать папку
          </button>
        </div>
      </div>
    </div>
  );
}