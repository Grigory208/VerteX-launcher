import { useEffect, useState } from 'react';
import { Check, FolderOpen, HardDrive, X, Cpu, MemoryStick } from 'lucide-react';

interface SettingsModalProps {
  onClose: () => void;
}

interface LauncherSettings {
  maxStorageGb: number;
  gamePath: string;
  javaPath: string;
  memoryMb: number;
  javaArgs: string;
}

const DEFAULT_SETTINGS: LauncherSettings = { maxStorageGb: 50, gamePath: '', javaPath: '', memoryMb: 4096, javaArgs: '' };
const SETTINGS_KEY = 'vertex-launcher-settings';

function readSettings(): LauncherSettings {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (!saved) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(saved) as Partial<LauncherSettings>;
    return {
      maxStorageGb: typeof parsed.maxStorageGb === 'number' ? parsed.maxStorageGb : DEFAULT_SETTINGS.maxStorageGb,
      gamePath: typeof parsed.gamePath === 'string' ? parsed.gamePath : DEFAULT_SETTINGS.gamePath,
      javaPath: typeof parsed.javaPath === 'string' ? parsed.javaPath : DEFAULT_SETTINGS.javaPath,
      memoryMb: typeof parsed.memoryMb === 'number' ? parsed.memoryMb : DEFAULT_SETTINGS.memoryMb,
      javaArgs: typeof parsed.javaArgs === 'string' ? parsed.javaArgs : DEFAULT_SETTINGS.javaArgs,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<LauncherSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const electronApi = window.electronAPI;

  useEffect(() => {
    setSettings(readSettings());
    if (electronApi?.getLauncherSettings) {
      electronApi.getLauncherSettings().then(setSettings).catch(() => undefined);
    }
  }, [electronApi]);

  const saveSettings = async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    if (electronApi?.saveLauncherSettings) await electronApi.saveLauncherSettings(settings);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };

  const chooseFolder = async () => {
    if (!electronApi?.chooseGameFolder) return;
    const selectedPath = await electronApi.chooseGameFolder();
    if (selectedPath) setSettings((current) => ({ ...current, gamePath: selectedPath }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[calc(100vh-48px)] overflow-y-auto scrollbar-thin bg-launcher-surface border border-launcher-border rounded-2xl shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-launcher-border">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-launcher-primary mb-1">Конфигурация</p>
            <h2 className="text-2xl font-bold text-launcher-text font-display">Настройки лаунчера</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-launcher-muted hover:text-launcher-text hover:bg-launcher-elevated transition-colors" aria-label="Закрыть настройки">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-8">
          <section>
            <div className="flex items-start gap-3 mb-5">
              <div className="p-2 rounded-lg bg-launcher-primary/10 text-launcher-primary"><HardDrive className="w-5 h-5" /></div>
              <div>
                <h3 className="font-display font-bold text-launcher-text">Место на диске</h3>
                <p className="text-sm text-launcher-muted mt-1">Максимальный размер файлов игры и лаунчера.</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="5"
                max="250"
                step="1"
                value={settings.maxStorageGb}
                onChange={(event) => setSettings((current) => ({ ...current, maxStorageGb: Number(event.target.value) }))}
                className="flex-1 accent-launcher-primary"
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="5"
                  max="250"
                  value={settings.maxStorageGb}
                  onChange={(event) => setSettings((current) => ({ ...current, maxStorageGb: Math.min(250, Math.max(5, Number(event.target.value) || 5)) }))}
                  className="w-20 bg-launcher-bg border border-launcher-border rounded-lg px-3 py-2 text-center text-launcher-text focus:border-launcher-primary focus:outline-none"
                />
                <span className="text-sm text-launcher-muted">ГБ</span>
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-launcher-muted mt-2"><span>5 ГБ</span><span>250 ГБ</span></div>
          </section>

          <section>
            <div className="flex items-start gap-3 mb-5">
              <div className="p-2 rounded-lg bg-launcher-primary/10 text-launcher-primary"><FolderOpen className="w-5 h-5" /></div>
              <div>
                <h3 className="font-display font-bold text-launcher-text">Папка игры</h3>
                <p className="text-sm text-launcher-muted mt-1">Здесь будут храниться версии Minecraft и файлы лаунчера.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <input value={settings.gamePath || 'Использовать папку приложения'} readOnly className="flex-1 min-w-0 bg-launcher-bg border border-launcher-border rounded-lg px-4 py-2.5 text-sm text-launcher-text" />
              <button onClick={chooseFolder} disabled={!electronApi?.chooseGameFolder} className="px-4 py-2.5 rounded-lg bg-launcher-elevated text-sm text-launcher-text hover:bg-launcher-border disabled:opacity-40 transition-colors">Выбрать</button>
            </div>
          </section>

          <section>
            <div className="flex items-start gap-3 mb-5">
              <div className="p-2 rounded-lg bg-launcher-primary/10 text-launcher-primary"><Cpu className="w-5 h-5" /></div>
              <div>
                <h3 className="font-display font-bold text-launcher-text">Java и память</h3>
                <p className="text-sm text-launcher-muted mt-1">Настройка JVM и оперативной памяти для запуска Minecraft.</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-launcher-muted mb-1.5 uppercase tracking-wide">Путь к Java</label>
                <input
                  type="text"
                  value={settings.javaPath}
                  onChange={(event) => setSettings((current) => ({ ...current, javaPath: event.target.value }))}
                  className="w-full bg-launcher-bg border border-launcher-border rounded-lg px-4 py-2.5 text-sm text-launcher-text focus:border-launcher-primary focus:outline-none transition-colors font-mono"
                  placeholder="Использовать встроенную Java"
                />
                <p className="text-[10px] text-launcher-muted mt-1">Оставьте пустым, чтобы использовать Java из комплекта лаунчера.</p>
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs text-launcher-muted mb-1.5 uppercase tracking-wide">
                  <MemoryStick className="w-3.5 h-3.5" /> Выделяемая память
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="1024"
                    max="16384"
                    step="512"
                    value={settings.memoryMb}
                    onChange={(event) => setSettings((current) => ({ ...current, memoryMb: Number(event.target.value) }))}
                    className="flex-1 accent-launcher-primary"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1024"
                      max="16384"
                      step="512"
                      value={settings.memoryMb}
                      onChange={(event) => setSettings((current) => ({ ...current, memoryMb: Math.min(16384, Math.max(1024, Number(event.target.value) || 1024)) }))}
                      className="w-24 bg-launcher-bg border border-launcher-border rounded-lg px-3 py-2 text-center text-launcher-text focus:border-launcher-primary focus:outline-none"
                    />
                    <span className="text-sm text-launcher-muted">МБ</span>
                  </div>
                </div>
                <div className="flex justify-between text-[10px] text-launcher-muted mt-2"><span>1 ГБ</span><span>16 ГБ</span></div>
              </div>
              <div>
                <label className="block text-xs text-launcher-muted mb-1.5 uppercase tracking-wide">Доп. JVM аргументы</label>
                <input
                  type="text"
                  value={settings.javaArgs}
                  onChange={(event) => setSettings((current) => ({ ...current, javaArgs: event.target.value }))}
                  className="w-full bg-launcher-bg border border-launcher-border rounded-lg px-4 py-2.5 text-sm text-launcher-text focus:border-launcher-primary focus:outline-none transition-colors font-mono"
                  placeholder="-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions"
                />
              </div>
            </div>
          </section>

          <div className="flex justify-end pt-2">
            <button onClick={saveSettings} className="px-5 py-2.5 rounded-lg bg-launcher-primary text-launcher-bg font-bold text-sm hover:bg-launcher-primary-dim transition-colors flex items-center gap-2">
              {saved ? <><Check className="w-4 h-4" /> Сохранено</> : 'Сохранить настройки'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
