import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Skin, SkinType } from '@/types';
import {
  X,
  Upload,
  Loader2,
  Trash2,
  Check,
  User,
  Shirt,
  AlertTriangle,
} from 'lucide-react';

interface SkinModalProps {
  onClose: () => void;
}

const STORAGE_BUCKET = 'skins';

export function SkinModal({ onClose }: SkinModalProps) {
  const [skins, setSkins] = useState<Skin[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [skinType, setSkinType] = useState<SkinType>('classic');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchSkins = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('skins')
      .select('*')
      .order('created_at', { ascending: false });
    if (!err) {
      setSkins((data as Skin[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSkins();
  }, [fetchSkins]);

  const handleUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.png')) {
      setError('Только PNG файлы поддерживаются');
      return;
    }
    if (file.size > 500_000) {
      setError('Размер файла не должен превышать 500 КБ');
      return;
    }

    setUploading(true);
    setError('');
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Не авторизован');

      const ext = file.name.split('.').pop() ?? 'png';
      const fileName = `${userData.user.id}/${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(fileName, file, { contentType: 'image/png', upsert: false });

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(fileName);

      await supabase.from('skins').update({ active: false }).eq('user_id', userData.user.id);

      const { error: insertErr } = await supabase.from('skins').insert({
        skin_url: urlData.publicUrl,
        skin_type: skinType,
        active: true,
      });

      if (insertErr) throw insertErr;

      fetchSkins();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки скина');
    }
    setUploading(false);
  };

  const setActive = async (skin: Skin) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    await supabase.from('skins').update({ active: false }).eq('user_id', userData.user.id);
    await supabase.from('skins').update({ active: true }).eq('id', skin.id);
    fetchSkins();
  };

  const deleteSkin = async (id: string) => {
    await supabase.from('skins').delete().eq('id', id);
    setDeleteConfirm(null);
    fetchSkins();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6 animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-xl max-h-[calc(100vh-48px)] overflow-y-auto scrollbar-thin bg-launcher-surface border border-launcher-border rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-launcher-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-launcher-primary/10 flex items-center justify-center">
              <Shirt className="w-5 h-5 text-launcher-primary" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-launcher-primary mb-0.5">Кастомизация</p>
              <h2 className="text-2xl font-bold text-launcher-text font-display">Скин система</h2>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-launcher-muted hover:text-launcher-text hover:bg-launcher-elevated transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <section>
            <div className="flex items-start gap-3 mb-4">
              <Upload className="w-5 h-5 text-launcher-primary flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display font-bold text-launcher-text">Загрузить новый скин</h3>
                <p className="text-sm text-launcher-muted mt-1">PNG файл, до 500 КБ. Классический (64x32) или Slim (64x64) формат.</p>
              </div>
            </div>

            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setSkinType('classic')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${skinType === 'classic' ? 'bg-launcher-primary text-launcher-bg' : 'bg-launcher-bg text-launcher-muted border border-launcher-border'}`}
              >
                Классический (Steve)
              </button>
              <button
                onClick={() => setSkinType('slim')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${skinType === 'slim' ? 'bg-launcher-primary text-launcher-bg' : 'bg-launcher-bg text-launcher-muted border border-launcher-border'}`}
              >
                Slim (Alex)
              </button>
            </div>

            <label className="flex flex-col items-center justify-center gap-2 p-8 rounded-xl border-2 border-dashed border-launcher-border hover:border-launcher-primary/50 bg-launcher-bg cursor-pointer transition-all">
              {uploading ? (
                <Loader2 className="w-8 h-8 text-launcher-primary animate-spin" />
              ) : (
                <>
                  <Upload className="w-8 h-8 text-launcher-muted" />
                  <span className="text-sm text-launcher-text font-medium">Выберите PNG файл</span>
                  <span className="text-xs text-launcher-muted">или перетащите сюда</span>
                </>
              )}
              <input
                type="file"
                accept=".png"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                }}
              />
            </label>

            {error && (
              <div className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-launcher-danger/10 text-launcher-danger text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
          </section>

          <section className="border-t border-launcher-border pt-5">
            <h3 className="text-sm font-bold text-launcher-text uppercase tracking-wide mb-3">Мои скины</h3>
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 text-launcher-primary animate-spin" />
              </div>
            ) : skins.length === 0 ? (
              <div className="text-center py-8">
                <User className="w-10 h-10 mx-auto mb-2 text-launcher-muted opacity-40" />
                <p className="text-sm text-launcher-muted">Скинов пока нет. Загрузите первый!</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {skins.map((skin) => (
                  <div
                    key={skin.id}
                    className={`relative rounded-xl border overflow-hidden group ${skin.active ? 'border-launcher-primary' : 'border-launcher-border'}`}
                  >
                    {skin.skin_url ? (
                      <img src={skin.skin_url} alt="Skin" className="w-full aspect-[2/1] object-cover bg-launcher-bg" />
                    ) : (
                      <div className="w-full aspect-[2/1] bg-launcher-elevated flex items-center justify-center">
                        <User className="w-6 h-6 text-launcher-border" />
                      </div>
                    )}
                    <div className="p-2">
                      <p className="text-[10px] text-launcher-muted capitalize">{skin.skin_type}</p>
                    </div>
                    {skin.active && (
                      <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-launcher-primary text-launcher-bg rounded-full px-2 py-0.5">
                        <Check className="w-3 h-3" />
                        <span className="text-[9px] font-bold">Активен</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-launcher-bg/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      {!skin.active && (
                        <button
                          onClick={() => setActive(skin)}
                          className="p-2 rounded-lg bg-launcher-primary text-launcher-bg hover:bg-launcher-primary-dim transition-colors"
                          title="Сделать активным"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                      {deleteConfirm === skin.id ? (
                        <button
                          onClick={() => deleteSkin(skin.id)}
                          className="p-2 rounded-lg bg-launcher-danger text-white"
                          title="Подтвердить"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(skin.id)}
                          className="p-2 rounded-lg bg-launcher-elevated text-launcher-danger hover:bg-launcher-border transition-colors"
                          title="Удалить"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
