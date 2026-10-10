import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Client } from '@/types';
import { useDownload } from '@/hooks/useDownload';
import { useInstalledVersions } from '@/hooks/useInstalledVersions';
import {
  Download,
  RefreshCw,
  Play,
  CheckCircle2,
  X,
  FileArchive,
  Zap,
  XCircle,
} from 'lucide-react';

interface ClientCardProps {
  client: Client;
  onInstalledChange: () => void;
}

const TAG_COLORS: Record<string, string> = {
  'Оптимизация 140+ FPS': 'text-launcher-primary bg-launcher-primary/10 border-launcher-primary/30',
  'Для слабых ПК': 'text-launcher-accent bg-launcher-accent/10 border-launcher-accent/30',
  'С модами': 'text-launcher-warning bg-launcher-warning/10 border-launcher-warning/30',
  'PvP': 'text-launcher-danger bg-launcher-danger/10 border-launcher-danger/30',
};

function getTagClass(tag: string): string {
  return TAG_COLORS[tag] ?? 'text-launcher-muted bg-launcher-border/30 border-launcher-border';
}

const STATUS_LABELS: Record<string, string> = {
  'downloading-core': 'Скачивание ядра...',
  'installing-mods': 'Установка модов...',
  'configuring': 'Настройка клиента...',
  'done': 'Готово!',
  'idle': '',
};

export function ClientCard({ client, onInstalledChange }: ClientCardProps) {
  const { getInstalled, setInstalled } = useInstalledVersions();
  const installedVersion = getInstalled(client.id);
  const [justInstalled, setJustInstalled] = useState(false);

  const onComplete = useCallback(() => {
    setInstalled(client.id, client.version);
    setJustInstalled(true);
    onInstalledChange();
  }, [client.id, client.version, setInstalled, onInstalledChange]);

  const { state, start, cancel } = useDownload(client, onComplete);

  const isDownloading = state.status !== 'idle' && state.status !== 'done';
  const needsUpdate = installedVersion !== null && installedVersion !== client.version;
  const isUpToDate = installedVersion !== null && installedVersion === client.version;

  const handleMainAction = () => {
    if (isDownloading) {
      cancel();
      return;
    }
    if (isUpToDate) {
      return;
    }
    start();
  };

  const getButtonConfig = () => {
    if (isDownloading) {
      return { label: 'ОТМЕНИТЬ', icon: X, class: 'bg-launcher-danger text-white hover:bg-launcher-danger/80' };
    }
    if (needsUpdate) {
      return { label: 'ОБНОВИТЬ', icon: RefreshCw, class: 'bg-launcher-warning text-launcher-bg hover:brightness-110' };
    }
    if (isUpToDate) {
      return { label: 'ЗАПУСТИТЬ', icon: Play, class: 'bg-launcher-primary text-launcher-bg hover:bg-launcher-primary-dim animate-pulse-glow' };
    }
    return { label: 'СКАЧАТЬ', icon: Download, class: 'bg-launcher-primary text-launcher-bg hover:bg-launcher-primary-dim' };
  };

  const btn = getButtonConfig();
  const BtnIcon = btn.icon;

  return (
    <div className="bg-launcher-surface border border-launcher-border rounded-xl overflow-hidden hover:border-launcher-primary/40 transition-all duration-300 group flex flex-col">
      <div className="relative h-36 bg-gradient-to-br from-launcher-elevated to-launcher-bg overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-30" />
        <div className="absolute inset-0 flex items-center justify-center">
          <FileArchive className="w-12 h-12 text-launcher-border group-hover:text-launcher-primary/50 transition-colors duration-300" />
        </div>
        <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-launcher-bg/80 backdrop-blur-sm rounded-full px-3 py-1">
          <span className="text-xs font-mono text-launcher-muted">v{client.version}</span>
        </div>
        {isUpToDate && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-launcher-primary/20 backdrop-blur-sm rounded-full px-3 py-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-launcher-primary" />
            <span className="text-xs font-medium text-launcher-primary">Установлено</span>
          </div>
        )}
        {needsUpdate && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-launcher-warning/20 backdrop-blur-sm rounded-full px-3 py-1 animate-pulse">
            <Zap className="w-3.5 h-3.5 text-launcher-warning" />
            <span className="text-xs font-medium text-launcher-warning">Доступно обновление</span>
          </div>
        )}
      </div>

      <div className="p-5 flex flex-col flex-1">
        <h3 className="text-lg font-bold text-launcher-text font-display mb-1">{client.name}</h3>
        <p className="text-sm text-launcher-muted mb-3 line-clamp-2">{client.description}</p>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {client.tags.map((tag) => (
            <span key={tag} className={`text-[10px] font-medium px-2.5 py-1 rounded-full border ${getTagClass(tag)}`}>
              {tag}
            </span>
          ))}
        </div>

        {needsUpdate && client.changelog && (
          <div className="mb-4 bg-launcher-bg rounded-lg p-3 border border-launcher-border">
            <p className="text-[10px] text-launcher-muted uppercase tracking-wide mb-1.5">Список изменений</p>
            <p className="text-xs text-launcher-text leading-relaxed">{client.changelog}</p>
          </div>
        )}

        {isDownloading && (
          <div className="mb-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-launcher-text font-medium">{STATUS_LABELS[state.status]}</span>
              <span className="text-launcher-muted font-mono">{state.speedMbps.toFixed(1)} МБ/с</span>
            </div>
            <div className="h-2 bg-launcher-bg rounded-full overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-launcher-primary to-launcher-accent rounded-full transition-all duration-200 relative"
                style={{ width: `${state.progress}%` }}
              >
                <div className="absolute inset-0 shimmer-bg" />
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-launcher-muted font-mono">
              <span>{state.downloadedMb.toFixed(0)} / {state.totalMb} МБ</span>
              <span>{state.progress.toFixed(0)}%</span>
            </div>
          </div>
        )}

        {justInstalled && state.status === 'done' && (
          <div className="mb-4 flex items-center gap-2 text-sm text-launcher-primary animate-fade-in">
            <CheckCircle2 className="w-4 h-4" />
            Установка завершена!
          </div>
        )}

        <div className="mt-auto">
          <button
            onClick={handleMainAction}
            className={`w-full py-3 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${btn.class}`}
          >
            <BtnIcon className={`w-4 h-4 ${isDownloading ? '' : ''}`} />
            {btn.label}
          </button>
          <div className="flex items-center justify-center gap-3 mt-2 text-[10px] text-launcher-muted">
            <span>{client.file_size_mb} МБ</span>
            {installedVersion && (
              <>
                <span>·</span>
                <span>Локальная: v{installedVersion}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CatalogView({ onInstalledChange }: { onInstalledChange: () => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchClients = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });
    if (err) {
      setError('Не удалось загрузить каталог');
    } else {
      setClients((data as Client[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-10 h-10 border-2 border-launcher-border border-t-launcher-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <XCircle className="w-12 h-12 text-launcher-danger mx-auto mb-3" />
          <p className="text-launcher-muted">{error}</p>
          <button onClick={fetchClients} className="mt-4 px-4 py-2 bg-launcher-elevated rounded-lg text-sm text-launcher-text hover:bg-launcher-border transition-colors">
            Повторить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 h-full overflow-y-auto scrollbar-thin">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-launcher-text font-display">Каталог сборок</h2>
        <p className="text-sm text-launcher-muted mt-1">Оптимизированные клиенты Minecraft, обновляемые в реальном времени</p>
      </div>

      {clients.length === 0 ? (
        <div className="text-center py-20 text-launcher-muted">
          <FileArchive className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>В каталоге пока нет сборок</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {clients.map((client) => (
            <ClientCard key={client.id} client={client} onInstalledChange={onInstalledChange} />
          ))}
        </div>
      )}
    </div>
  );
}
