import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function ResetPasswordModal() {
  const [showResetModal, setShowResetModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleAuthUrl = async (url: string) => {
      try {
        const hash = url.split('#')[1];
        if (!hash) return;
        
        const params = new URLSearchParams(hash);
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');

        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token });
          setShowResetModal(true); // Показываем окно
        }
      } catch (e) {
        console.error('Ошибка при чтении ссылки сброса:', e);
      }
    };

    // 1. Слушаем ссылку, если приложение УЖЕ открыто
    if ((window as any).electronAPI?.onAuthCallback) {
      (window as any).electronAPI.onAuthCallback(handleAuthUrl);
    }

    // 2. Спрашиваем, не запущено ли приложение с ссылкой (если оно только что открылось)
    if ((window as any).electronAPI?.getPendingDeepLink) {
      (window as any).electronAPI.getPendingDeepLink().then((url: string | null) => {
        if (url) handleAuthUrl(url);
      });
    }
  }, []);

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) {
      alert('Пароль должен быть не менее 6 символов');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (error) {
      alert(`Ошибка: ${error.message}`);
    } else {
      alert('Пароль успешно изменен! Теперь вы можете войти.');
      setShowResetModal(false);
      setNewPassword('');
    }
  };

  if (!showResetModal) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
      <div className="w-full max-w-md bg-launcher-surface border border-launcher-border rounded-2xl shadow-2xl p-6">
        <h2 className="text-2xl font-bold text-launcher-text font-display mb-2">Новый пароль</h2>
        <p className="text-launcher-muted text-sm mb-6">Придумайте новый пароль для вашего аккаунта.</p>
        
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Новый пароль"
          className="w-full bg-launcher-bg border border-launcher-border rounded-lg px-4 py-3 text-launcher-text mb-6 focus:border-launcher-primary focus:outline-none"
        />
        
        <div className="flex gap-3">
          <button 
            onClick={() => setShowResetModal(false)}
            className="flex-1 py-3 rounded-lg bg-launcher-elevated text-launcher-text font-bold hover:bg-launcher-border transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleUpdatePassword}
            disabled={loading}
            className="flex-1 py-3 rounded-lg bg-launcher-primary text-launcher-bg font-bold hover:bg-launcher-primary-dim transition-colors disabled:opacity-50"
          >
            {loading ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}