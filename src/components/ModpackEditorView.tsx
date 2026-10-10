import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type { Modpack, ModpackMod, ModrinthSearchResult } from '@/types';
import {
  Package,
  Plus,
  Trash2,
  Settings2,
  X,
  Loader2,
  Cpu,
  MemoryStick,
  Save,
  Play,
  Edit3,
  Copy,
  Download,
  ChevronDown,
  PackagePlus,
} from 'lucide-react';

const MC_VERSIONS = ['1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.19.2', '1.18.2', '1.16.5', '1.12.2'];
const LOADERS = ['fabric', 'forge', 'quilt', 'neoforge'];
const MEMORY_OPTIONS = [2048, 4096, 6144, 8192, 12288, 16384];

const EMPTY_PACK: Omit<Modpack, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  name: '',
  description: '',
  mc_version: '1.20.4',
  loader: 'fabric',
  mods: [],
  memory: 4096,
  java_args: '',
};

export function ModpackEditorView() {
  const auth = useAuth();
  const [packs, setPacks] = useState<Modpack[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Modpack | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Omit<Modpack, 'id' | 'user_id' | 'created_at' | 'updated_at'>>(EMPTY_PACK);
  const [saving, setSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [importingMod, setImportingMod] = useState<ModpackMod | null>(null);

  const fetchPacks = useCallback(async () => {
    if (!auth.session) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('modpacks')
      .select('*')
      .order('updated_at', { ascending: false });
    if (!error) {
      setPacks((data as Modpack[]) ?? []);
    }
    setLoading(false);
  }, [auth.session]);

  useEffect(() => {
    fetchPacks();
  }, [fetchPacks]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Partial<ModpackMod>;
      setImportingMod({
        project_id: detail.project_id ?? '',
        slug: detail.slug ?? '',
        title: detail.title ?? '',
        icon_url: detail.icon_url ?? '',
        version_id: '',
        file_name: '',
        download_url: '',
        categories: detail.categories ?? [],
      });
    };
    window.addEventListener('add-mod-to-modpack', handler);
    return () => window.removeEventListener('add-mod-to-modpack', handler);
  }, []);

  useEffect(() => {
    if (importingMod && !editing && !creating) {
      startNew();
      setDraft((d) => ({
        ...d,
        loader: importingMod.categories.find((c) => LOADERS.includes(c)) ?? d.loader,
        mods: [importingMod],
      }));
      setImportingMod(null);
    } else if (importingMod && (editing || creating)) {
      setDraft((d) => {
        if (d.mods.some((m) => m.project_id === importingMod.project_id)) return d;
        return { ...d, mods: [...d.mods, importingMod] };
      });
      setImportingMod(null);
    }
  }, [importingMod, editing, creating]);

  const startNew = () => {
    setDraft(EMPTY_PACK);
    setCreating(true);
    setEditing(null);
    setMessage(null);
  };

  const startEdit = (pack: Modpack) => {
    setDraft({
      name: pack.name,
      description: pack.description,
      mc_version: pack.mc_version,
      loader: pack.loader,
      mods: pack.mods,
      memory: pack.memory,
      java_args: pack.java_args,
    });
    setEditing(pack);
    setCreating(false);
    setMessage(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setCreating(false);
    setDraft(EMPTY_PACK);
    setMessage(null);
  };

  const savePack = async () => {
    if (!draft.name.trim()) {
      setMessage({ type: 'error', text: 'Введите название модпака' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      if (editing) {
        const { error } = await supabase
          .from('modpacks')
          .update({ ...draft, updated_at: new Date().toISOString() })
          .eq('id', editing.id);
        if (error) throw error;
        setMessage({ type: 'success', text: 'Модпак обновлён' });
      } else {
        const { error } = await supabase
          .from('modpacks')
          .insert(draft);
        if (error) throw error;
        setMessage({ type: 'success', text: 'Модпак создан' });
      }
      cancelEdit();
      fetchPacks();
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Ошибка сохранения',
      });
    }
    setSaving(false);
  };

  const deletePack = async (id: string) => {
    const { error } = await supabase.from('modpacks').delete().eq('id', id);
    if (error) {
      setMessage({ type: 'error', text: 'Не удалось удалить модпак' });
    } else {
      setMessage({ type: 'success', text: 'Модпак удалён' });
      fetchPacks();
    }
    setDeleteConfirm(null);
  };

  const duplicatePack = async (pack: Modpack) => {
    const { error } = await supabase.from('modpacks').insert({
      name: `${pack.name} (копия)`,
      description: pack.description,
      mc_version: pack.mc_version,
      loader: pack.loader,
      mods: pack.mods,
      memory: pack.memory,
      java_args: pack.java_args,
    });
    if (error) {
      setMessage({ type: 'error', text: 'Не удалось дублировать' });
    } else {
      setMessage({ type: 'success', text: 'Модпак дублирован' });
      fetchPacks();
    }
  };

  const removeModFromDraft = (projectId: string) => {
    setDraft((d) => ({ ...d, mods: d.mods.filter((m) => m.project_id !== projectId) }));
  };

  if (!auth.session) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Package className="w-12 h-12 mx-auto mb-3 text-launcher-muted opacity-50" />
          <p className="text-launcher-muted">Войдите в аккаунт, чтобы создавать модпаки</p>
        </div>
      </div>
    );
  }

  const isActive = creating || editing !== null;

  return (
    <div className="h-full flex flex-col md:flex-row overflow-hidden">
      <div className="w-full md:w-80 max-h-[40vh] md:max-h-full border-b md:border-b-0 md:border-r border-launcher-border bg-launcher-surface/50 flex flex-col overflow-hidden flex-shrink-0">
        <div className="p-4 border-b border-launcher-border">
          <button
            onClick={startNew}
            disabled={isActive}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-launcher-primary text-launcher-bg font-bold text-sm hover:bg-launcher-primary-dim disabled:opacity-40 transition-colors"
          >
            <Plus className="w-4 h-4" /> Новый модпак
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-2">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 text-launcher-primary animate-spin" />
            </div>
          ) : packs.length === 0 ? (
            <div className="text-center py-12 text-launcher-muted">
              <PackagePlus className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Пока нет модпаков</p>
              <p className="text-xs mt-1">Создайте первый!</p>
            </div>
          ) : (
            packs.map((pack) => (
              <div
                key={pack.id}
                className={`rounded-xl border p-3 cursor-pointer transition-all group ${editing?.id === pack.id ? 'border-launcher-primary bg-launcher-primary/10' : 'border-launcher-border bg-launcher-surface hover:border-launcher-primary/30'}`}
                onClick={() => startEdit(pack)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-launcher-text truncate">{pack.name}</p>
                    <p className="text-xs text-launcher-muted mt-0.5">
                      {pack.loader} · {pack.mc_version} · {pack.mods.length} модов
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => duplicatePack(pack)}
                    className="p-1.5 rounded-md text-launcher-muted hover:text-launcher-accent hover:bg-launcher-elevated transition-colors"
                    title="Дублировать"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  {deleteConfirm === pack.id ? (
                    <button
                      onClick={() => deletePack(pack.id)}
                      className="p-1.5 rounded-md bg-launcher-danger/20 text-launcher-danger"
                      title="Подтвердить"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(pack.id)}
                      className="p-1.5 rounded-md text-launcher-muted hover:text-launcher-danger hover:bg-launcher-elevated transition-colors"
                      title="Удалить"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {deleteConfirm === pack.id && (
                  <p className="text-[10px] text-launcher-danger mt-1.5">Нажмите ещё раз для подтверждения</p>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {!isActive ? (
          <div className="h-full flex items-center justify-center p-8">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-launcher-elevated flex items-center justify-center">
                <Package className="w-10 h-10 text-launcher-primary" />
              </div>
              <h2 className="text-xl font-bold text-launcher-text font-display mb-2">Модпак редактор</h2>
              <p className="text-sm text-launcher-muted mb-6">
                Создавайте собственные сборки с модами с Modrinth. Настраивайте версию Minecraft, загрузчик, память и JVM аргументы для каждой сборки отдельно.
              </p>
              <button
                onClick={startNew}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-launcher-primary text-launcher-bg font-bold text-sm hover:bg-launcher-primary-dim transition-colors"
              >
                <Plus className="w-5 h-5" /> Создать модпак
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 max-w-4xl mx-auto">
            {message && (
              <div className={`mb-4 flex items-center gap-2.5 px-4 py-3 rounded-lg animate-fade-in ${
                message.type === 'success' ? 'bg-launcher-primary/10 text-launcher-primary border border-launcher-primary/30' : 'bg-launcher-danger/10 text-launcher-danger border border-launcher-danger/30'
              }`}>
                <span className="text-sm font-medium">{message.text}</span>
                <button onClick={() => setMessage(null)} className="ml-auto"><X className="w-4 h-4" /></button>
              </div>
            )}

            <div className="bg-launcher-surface border border-launcher-border rounded-xl p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-launcher-muted mb-1.5 uppercase tracking-wide">Название *</label>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className="w-full bg-launcher-bg border border-launcher-border rounded-lg px-4 py-2.5 text-sm text-launcher-text focus:border-launcher-primary focus:outline-none transition-colors"
                    placeholder="My Awesome Pack"
                  />
                </div>
                <div>
                  <label className="block text-xs text-launcher-muted mb-1.5 uppercase tracking-wide">Описание</label>
                  <input
                    type="text"
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    className="w-full bg-launcher-bg border border-launcher-border rounded-lg px-4 py-2.5 text-sm text-launcher-text focus:border-launcher-primary focus:outline-none transition-colors"
                    placeholder="Краткое описание сборки"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-launcher-muted mb-1.5 uppercase tracking-wide">Версия Minecraft</label>
                  <SelectInput value={draft.mc_version} onChange={(v) => setDraft({ ...draft, mc_version: v })} options={MC_VERSIONS} />
                </div>
                <div>
                  <label className="block text-xs text-launcher-muted mb-1.5 uppercase tracking-wide">Загрузчик</label>
                  <SelectInput value={draft.loader} onChange={(v) => setDraft({ ...draft, loader: v })} options={LOADERS} />
                </div>
                <div>
                  <label className="block text-xs text-launcher-muted mb-1.5 uppercase tracking-wide">Память (МБ)</label>
                  <SelectInput
                    value={String(draft.memory)}
                    onChange={(v) => setDraft({ ...draft, memory: Number(v) })}
                    options={MEMORY_OPTIONS.map(String)}
                  />
                </div>
              </div>

              <button
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center gap-2 text-sm text-launcher-muted hover:text-launcher-text transition-colors"
              >
                <Settings2 className="w-4 h-4" />
                Дополнительные настройки (JVM аргументы)
                <ChevronDown className={`w-4 h-4 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
              </button>
              {showSettings && (
                <div className="animate-fade-in">
                  <label className="block text-xs text-launcher-muted mb-1.5 uppercase tracking-wide">JVM аргументы</label>
                  <input
                    type="text"
                    value={draft.java_args}
                    onChange={(e) => setDraft({ ...draft, java_args: e.target.value })}
                    className="w-full bg-launcher-bg border border-launcher-border rounded-lg px-4 py-2.5 text-sm text-launcher-text focus:border-launcher-primary focus:outline-none transition-colors font-mono"
                    placeholder="-Xmx4G -XX:+UseG1GC -XX:+UnlockExperimentalVMOptions"
                  />
                  <p className="text-[10px] text-launcher-muted mt-1">Память уже настроена через селектор выше. Здесь можно добавить флаги GC и т.д.</p>
                </div>
              )}

              <div className="border-t border-launcher-border pt-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-launcher-text uppercase tracking-wide">Моды ({draft.mods.length})</h3>
                  <a
                    href="#mods"
                    onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('navigate-to-mods')); }}
                    className="text-xs text-launcher-primary hover:text-launcher-primary-dim transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Добавить из каталога
                  </a>
                </div>

                {draft.mods.length === 0 ? (
                  <div className="text-center py-8 bg-launcher-bg rounded-xl border border-dashed border-launcher-border">
                    <Package className="w-8 h-8 mx-auto mb-2 text-launcher-muted opacity-50" />
                    <p className="text-sm text-launcher-muted">Модов пока нет. Перейдите в раздел «Моды» и добавьте их в сборку.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {draft.mods.map((mod) => (
                      <div key={mod.project_id} className="flex items-center gap-3 p-2.5 rounded-lg bg-launcher-bg border border-launcher-border hover:border-launcher-border/70 transition-colors group">
                        {mod.icon_url ? (
                          <img src={mod.icon_url} alt={mod.title} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-launcher-elevated flex items-center justify-center flex-shrink-0">
                            <Package className="w-5 h-5 text-launcher-border" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-launcher-text truncate">{mod.title}</p>
                          <p className="text-[10px] text-launcher-muted">{mod.slug}</p>
                        </div>
                        <button
                          onClick={() => removeModFromDraft(mod.project_id)}
                          className="p-1.5 rounded-md text-launcher-muted hover:text-launcher-danger hover:bg-launcher-elevated transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 pt-3 border-t border-launcher-border">
                <button
                  onClick={savePack}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-launcher-primary text-launcher-bg font-bold text-sm hover:bg-launcher-primary-dim disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editing ? 'Сохранить' : 'Создать'}
                </button>
                <button
                  onClick={cancelEdit}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-launcher-elevated text-launcher-text font-medium text-sm hover:bg-launcher-border transition-colors"
                >
                  <X className="w-4 h-4" /> Отмена
                </button>
                {editing && (
                  <div className="ml-auto flex items-center gap-2 text-xs text-launcher-muted">
                    <MemoryStick className="w-3.5 h-3.5" />
                    {draft.memory} МБ · {draft.loader}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-launcher-bg border border-launcher-border rounded-lg px-4 py-2.5 text-sm text-launcher-text focus:border-launcher-primary focus:outline-none transition-colors cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-launcher-muted pointer-events-none" />
    </div>
  );
}
