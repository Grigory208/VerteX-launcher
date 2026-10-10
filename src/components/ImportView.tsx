import { useState, useCallback } from 'react';
import {
  FolderUp,
  FileArchive,
  CheckCircle2,
  XCircle,
  X,
  Loader2,
} from 'lucide-react';

type ImportPhase = 'idle' | 'uploading' | 'extracting' | 'configuring' | 'done' | 'error';

export function ImportView() {
  const [phase, setPhase] = useState<ImportPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [intervalId, setIntervalId] = useState<ReturnType<typeof setInterval> | null>(null);

  const reset = useCallback(() => {
    if (intervalId) clearInterval(intervalId);
    setIntervalId(null);
    setPhase('idle');
    setProgress(0);
    setFileName('');
  }, [intervalId]);

  const simulateImport = useCallback((name: string) => {
    setFileName(name);
    setPhase('uploading');
    setProgress(0);

    let current = 0;
    let currentPhase: ImportPhase = 'uploading';
    const id = setInterval(() => {
      current = Math.min(current + 2 + Math.random() * 4, 100);

      if (currentPhase === 'uploading' && current >= 35) {
        currentPhase = 'extracting';
        setPhase('extracting');
      } else if (currentPhase === 'extracting' && current >= 75) {
        currentPhase = 'configuring';
        setPhase('configuring');
      }

      setProgress(current);

      if (current >= 100) {
        clearInterval(id);
        setIntervalId(null);
        setPhase('done');
      }
    }, 150);
    setIntervalId(id);
  }, []);

  const handleFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setPhase('error');
      setFileName(file.name);
      return;
    }
    simulateImport(file.name);
  }, [simulateImport]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const PHASE_LABELS: Record<ImportPhase, string> = {
    'idle': '',
    'uploading': 'Загрузка архива...',
    'extracting': 'Распаковка ZIP...',
    'configuring': 'Настройка сборки...',
    'done': 'Импорт завершён!',
    'error': 'Ошибка: нужен .zip файл',
  };

  const isActive = phase === 'uploading' || phase === 'extracting' || phase === 'configuring';

  return (
    <div className="p-8 h-full overflow-y-auto scrollbar-thin">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-launcher-text font-display">Импорт сборки</h2>
        <p className="text-sm text-launcher-muted mt-1">Загрузите готовую сборку из ZIP-архива на вашем компьютере</p>
      </div>

      <div className="max-w-2xl">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => phase === 'idle' && document.getElementById('import-file-input')?.click()}
          className={`
            relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 cursor-pointer
            ${dragOver
              ? 'border-launcher-primary bg-launcher-primary/5 scale-[1.02]'
              : phase === 'idle'
              ? 'border-launcher-border hover:border-launcher-primary/50 bg-launcher-surface'
              : 'border-launcher-border bg-launcher-surface cursor-default'
            }
          `}
        >
          <input
            id="import-file-input"
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />

          {phase === 'idle' && (
            <div className="animate-fade-in">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-launcher-elevated flex items-center justify-center">
                <FolderUp className="w-10 h-10 text-launcher-primary" />
              </div>
              <p className="text-lg font-medium text-launcher-text mb-1">Перетащите ZIP-архив сюда</p>
              <p className="text-sm text-launcher-muted">или нажмите, чтобы выбрать файл</p>
              <p className="text-xs text-launcher-muted/60 mt-4">Поддерживаются только .zip архивы</p>
            </div>
          )}

          {isActive && (
            <div className="animate-fade-in">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-launcher-elevated flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-launcher-primary animate-spin" />
              </div>
              <p className="text-lg font-medium text-launcher-text mb-1">{PHASE_LABELS[phase]}</p>
              <p className="text-sm text-launcher-muted mb-6 truncate">{fileName}</p>

              <div className="max-w-md mx-auto space-y-2">
                <div className="h-3 bg-launcher-bg rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-launcher-primary to-launcher-accent rounded-full transition-all duration-150 relative"
                    style={{ width: `${progress}%` }}
                  >
                    <div className="absolute inset-0 shimmer-bg" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-launcher-muted font-mono">
                  <span>{PHASE_LABELS[phase]}</span>
                  <span>{progress.toFixed(0)}%</span>
                </div>
              </div>
            </div>
          )}

          {phase === 'done' && (
            <div className="animate-fade-in">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-launcher-primary/10 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-launcher-primary" />
              </div>
              <p className="text-lg font-medium text-launcher-text mb-1">Сборка импортирована!</p>
              <p className="text-sm text-launcher-muted mb-4 truncate">{fileName}</p>
              <button onClick={reset} className="px-6 py-2.5 rounded-lg bg-launcher-primary text-launcher-bg font-bold text-sm hover:bg-launcher-primary-dim transition-colors">
                Импортировать ещё
              </button>
            </div>
          )}

          {phase === 'error' && (
            <div className="animate-fade-in">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-launcher-danger/10 flex items-center justify-center">
                <XCircle className="w-8 h-8 text-launcher-danger" />
              </div>
              <p className="text-lg font-medium text-launcher-text mb-1">Неверный формат</p>
              <p className="text-sm text-launcher-muted mb-4">Выберите файл с расширением .zip</p>
              <button onClick={reset} className="px-6 py-2.5 rounded-lg bg-launcher-elevated text-launcher-text font-medium text-sm hover:bg-launcher-border transition-colors">
                Попробовать снова
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 bg-launcher-surface border border-launcher-border rounded-xl p-5">
          <div className="flex items-start gap-3">
            <FileArchive className="w-5 h-5 text-launcher-muted flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-launcher-text mb-1">Как это работает</p>
              <ul className="text-xs text-launcher-muted space-y-1.5">
                <li>• ZIP-архив распаковывается и проверяется на структуру сборки</li>
                <li>• Моды и конфиги автоматически переносятся в директорию игры</li>
                <li>• После установки сборка появится в списке на главном экране</li>
                <li>• Импортированные сборки обновляются только вручную</li>
              </ul>
            </div>
          </div>
        </div>

        {phase !== 'idle' && (
          <button
            onClick={reset}
            className="mt-4 flex items-center gap-2 text-sm text-launcher-muted hover:text-launcher-text transition-colors"
          >
            <X className="w-4 h-4" /> Сбросить
          </button>
        )}
      </div>
    </div>
  );
}
