import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Client, ClientUpdate } from '@/types';
import {
  Shield,
  Plus,
  Upload,
  Trash2,
  Pencil,
  CheckCircle2,
  X,
  AlertTriangle,
  FileText,
  History,
  Loader2,
} from 'lucide-react';

const TAG_PRESETS = [
  'Оптимизация 140+ FPS',
  'Для слабых ПК',
  'С модами',
  'Без модов',
  'PvP',
  'Технологии',
  'Магия',
];

interface AdminForm {
  name: string;
  version: string;
  description: string;
  download_url: string;
  file_size_mb: string;
  tags: string[];
  changelog: string;
  icon_url: string;
}

const EMPTY_FORM: AdminForm = {
  name: '',
  version: '1.0.0',
  description: '',
  download_url: '',
  file_size_mb: '500',
  tags: [],
  changelog: '',
  icon_url: '',
};

export function AdminView() {
  const [form, setForm] = useState<AdminForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [updates, setUpdates] = useState<ClientUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [tab, setTab] = useState<'form' | 'history'>('form');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchClients = useCallback(async () => {
    const { data } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
    setClients((data as Client[]) ?? []);
    setLoading(false);
  }, []);

  const fetchUpdates = useCallback(async () => {
    const { data } = await supabase
      .from('updates')
      .select('*, clients(name)')
      .order('created_at', { ascending: false })
      .limit(20);
    setUpdates((data as (ClientUpdate & { clients: { name: string } | null })[]) ?? []);
  }, []);

  useEffect(() => {
    fetchClients();
    fetchUpdates();
  }, [fetchClients, fetchUpdates]);

  const toggleTag = (tag: string) => {
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag],
    }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.version.trim()) {
      setMessage({ type: 'error', text: 'Заполните название и версию' });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    const payload = {
      name: form.name.trim(),
      version: form.version.trim(),
      description: form.description.trim(),
      download_url: form.download_url.trim(),
      file_size_mb: parseInt(form.file_size_mb) || 0,
      tags: form.tags,
      changelog: form.changelog.trim(),
      icon_url: form.icon_url.trim(),
      updated_at: new Date().toISOString(),
    };

    try {
      if (editingId) {
        const { error: updateError } = await supabase
          .from('clients')
          .update(payload)
          .eq('id', editingId);
        if (updateError) throw updateError;

        await supabase.from('updates').insert({
          client_id: editingId,
          version: payload.version,
          changelog: payload.changelog,
        });

        setMessage({ type: 'success', text: `Клиент «${payload.name}» обновлён до v${payload.version}` });
      } else {
        const { data: newClient, error: insertError } = await supabase
          .from('clients')
          .insert(payload)
          .select()
          .single();
        if (insertError) throw insertError;

        if (newClient) {
          await supabase.from('updates').insert({
            client_id: newClient.id,
            version: payload.version,
            changelog: payload.changelog,
          });
        }

        setMessage({ type: 'success', text: `Клиент «${payload.name}» v${payload.version} опубликован!` });
      }

      setForm(EMPTY_FORM);
      setEditingId(null);
      fetchClients();
      fetchUpdates();
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Ошибка при публикации. Проверьте права доступа.',
      });
    }
    setSubmitting(false);
  };

  const handleEdit = (client: Client) => {
    setEditingId(client.id);
    setForm({
      name: client.name,
      version: client.version,
      description: client.description,
      download_url: client.download_url,
      file_size_mb: String(client.file_size_mb),
      tags: client.tags,
      changelog: client.changelog,
      icon_url: client.icon_url,
    });
    setTab('form');
    setMessage(null);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) {
      setMessage({ type: 'error', text: 'Не удалось удалить клиент' });
    } else {
      setMessage({ type: 'success', text: 'Клиент удалён' });
      fetchClients();
      fetchUpdates();
    }
    setDeleteConfirm(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setMessage(null);
  };

  return (
    <div className="p-8 h-full overflow-y-auto scrollbar-thin">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-launcher-danger/15 flex items-center justify-center">
          <Shield className="w-5 h-5 text-launcher-danger" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-launcher-text font-display">Админ-панель</h2>
          <p className="text-sm text-launcher-muted">Управление клиентами и публикация обновлений</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 p-1 bg-launcher-surface rounded-lg w-fit">
        <button
          onClick={() => setTab('form')}
          className={`px-5 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${tab === 'form' ? 'bg-launcher-primary text-launcher-bg' : 'text-launcher-muted hover:text-launcher-text'}`}
        >
          <Plus className="w-4 h-4" /> {editingId ? 'Редактировать' : 'Добавить клиент'}
        </button>
        <button
          onClick={() => setTab('history')}
          className={`px-5 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${tab === 'history' ? 'bg-launcher-primary text-launcher-bg' : 'text-launcher-muted hover:text-launcher-text'}`}
        >
          <History className="w-4 h-4" /> История обновлений
        </button>
      </div>

      {message && (
        <div className={`mb-6 flex items-center gap-2.5 px-4 py-3 rounded-lg animate-fade-in ${
          message.type === 'success' ? 'bg-launcher-primary/10 text-launcher-primary border border-launcher-primary/30' : 'bg-launcher-danger/10 text-launcher-danger border border-launcher-danger/30'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          <span className="text-sm font-medium">{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {tab === 'form' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-launcher-surface border border-launcher-border rounded-xl p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-launcher-muted mb-1.5 uppercase tracking-wide">Название сборки *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-launcher-bg border border-launcher-border rounded-lg px-4 py-2.5 text-sm text-launcher-text focus:border-launcher-primary focus:outline-none transition-colors"
                    placeholder="Vanilla+ FPS Boost"
                  />
                </div>
                <div>
                  <label className="block text-xs text-launcher-muted mb-1.5 uppercase tracking-wide">Версия *</label>
                  <input
                    type="text"
                    value={form.version}
                    onChange={(e) => setForm({ ...form, version: e.target.value })}
                    className="w-full bg-launcher-bg border border-launcher-border rounded-lg px-4 py-2.5 text-sm text-launcher-text focus:border-launcher-primary focus:outline-none transition-colors font-mono"
                    placeholder="1.2.0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-launcher-muted mb-1.5 uppercase tracking-wide">Описание</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full bg-launcher-bg border border-launcher-border rounded-lg px-4 py-2.5 text-sm text-launcher-text focus:border-launcher-primary focus:outline-none transition-colors resize-none"
                  placeholder="Краткое описание сборки..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-launcher-muted mb-1.5 uppercase tracking-wide">Ссылка на ZIP-архив</label>
                  <input
                    type="text"
                    value={form.download_url}
                    onChange={(e) => setForm({ ...form, download_url: e.target.value })}
                    className="w-full bg-launcher-bg border border-launcher-border rounded-lg px-4 py-2.5 text-sm text-launcher-text focus:border-launcher-primary focus:outline-none transition-colors font-mono"
                    placeholder="https://cdn.example.com/builds/vanilla-1.2.0.zip"
                  />
                </div>
                <div>
                  <label className="block text-xs text-launcher-muted mb-1.5 uppercase tracking-wide">Размер (МБ)</label>
                  <input
                    type="number"
                    value={form.file_size_mb}
                    onChange={(e) => setForm({ ...form, file_size_mb: e.target.value })}
                    className="w-full bg-launcher-bg border border-launcher-border rounded-lg px-4 py-2.5 text-sm text-launcher-text focus:border-launcher-primary focus:outline-none transition-colors font-mono"
                    placeholder="500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-launcher-muted mb-1.5 uppercase tracking-wide">Теги</label>
                <div className="flex flex-wrap gap-2">
                  {TAG_PRESETS.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                        form.tags.includes(tag)
                          ? 'bg-launcher-primary/15 text-launcher-primary border-launcher-primary/40'
                          : 'bg-launcher-bg text-launcher-muted border-launcher-border hover:border-launcher-muted'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-launcher-muted mb-1.5 uppercase tracking-wide flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> Changelog (список изменений)
                </label>
                <textarea
                  value={form.changelog}
                  onChange={(e) => setForm({ ...form, changelog: e.target.value })}
                  rows={4}
                  className="w-full bg-launcher-bg border border-launcher-border rounded-lg px-4 py-2.5 text-sm text-launcher-text focus:border-launcher-primary focus:outline-none transition-colors resize-none font-mono"
                  placeholder="v1.2.0: Улучшен рендер чанков, снижено потребление ОЗУ на 40%"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-3 rounded-lg bg-launcher-primary text-launcher-bg font-bold text-sm hover:bg-launcher-primary-dim disabled:opacity-50 transition-colors"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {editingId ? 'Сохранить изменения' : 'Опубликовать обновление'}
                </button>
                {editingId && (
                  <button
                    onClick={cancelEdit}
                    className="flex items-center gap-2 px-5 py-3 rounded-lg bg-launcher-elevated text-launcher-text font-medium text-sm hover:bg-launcher-border transition-colors"
                  >
                    <X className="w-4 h-4" /> Отмена
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-launcher-text uppercase tracking-wide">Текущие сборки</h3>
            {loading ? (
              <div className="text-launcher-muted text-sm">Загрузка...</div>
            ) : clients.length === 0 ? (
              <div className="text-launcher-muted text-sm">Пока нет сборок</div>
            ) : (
              clients.map((c) => (
                <div key={c.id} className="bg-launcher-surface border border-launcher-border rounded-lg p-3 hover:border-launcher-primary/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-launcher-text truncate">{c.name}</p>
                      <p className="text-xs text-launcher-muted">v{c.version} · {c.file_size_mb} МБ</p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => handleEdit(c)} className="p-1.5 rounded-md hover:bg-launcher-elevated text-launcher-muted hover:text-launcher-accent transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {deleteConfirm === c.id ? (
                        <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-md bg-launcher-danger/20 text-launcher-danger">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button onClick={() => setDeleteConfirm(c.id)} className="p-1.5 rounded-md hover:bg-launcher-elevated text-launcher-muted hover:text-launcher-danger transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  {deleteConfirm === c.id && (
                    <p className="text-[10px] text-launcher-danger mt-1.5">Нажмите ещё раз для подтверждения</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="bg-launcher-surface border border-launcher-border rounded-xl overflow-hidden">
          {updates.length === 0 ? (
            <div className="p-12 text-center text-launcher-muted">
              <History className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>История обновлений пуста</p>
            </div>
          ) : (
            <div className="divide-y divide-launcher-border">
              {updates.map((u) => {
                const update = u as ClientUpdate & { clients: { name: string } | null };
                const clientName = update.clients?.name ?? 'Удалённый клиент';
                return (
                  <div key={u.id} className="p-4 hover:bg-launcher-elevated/50 transition-colors">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-launcher-text">{clientName}</span>
                          <span className="text-xs font-mono text-launcher-primary bg-launcher-primary/10 px-2 py-0.5 rounded">v{u.version}</span>
                        </div>
                        {u.changelog && (
                          <p className="text-xs text-launcher-muted leading-relaxed">{u.changelog}</p>
                        )}
                      </div>
                      <span className="text-xs text-launcher-muted whitespace-nowrap">
                          {new Date(u.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
