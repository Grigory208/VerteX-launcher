import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { SkinModal } from '@/components/SkinModal';
import {
  Gamepad2,
  LayoutGrid,
  FolderUp,
  Shield,
  LogOut,
  LogIn,
  UserPlus,
  X,
  Lock,
  RefreshCw,
  Package,
  Boxes,
  Layers,
  Shirt,
  Menu,
} from 'lucide-react';
import type { ViewKey } from '@/types';

interface SidebarProps {
  activeView: ViewKey;
  onViewChange: (view: ViewKey) => void;
  auth: ReturnType<typeof useAuth>;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ activeView, onViewChange, auth, mobileOpen, onMobileClose }: SidebarProps) {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const nicknameRef = useRef<HTMLInputElement>(null);

  const [showSkinModal, setShowSkinModal] = useState(false);

  const displayName = auth.session ? (auth.profile?.username ?? 'Игрок') : 'Гость';
  const showAdmin = auth.isAdmin;
  const [refreshing, setRefreshing] = useState(false);

  const handleRefreshRole = async () => {
    setRefreshing(true);
    await auth.refreshProfile();
    setRefreshing(false);
  };

  useEffect(() => {
    const onFocus = () => { if (auth.session) auth.refreshProfile(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [auth.session, auth.refreshProfile]);

  const handleSignIn = async () => {
    setAuthLoading(true);
    setAuthError('');
    const { error } = await auth.signIn(email, password);
    if (error) {
      setAuthError(error.message);
    } else {
      setShowAuthModal(false);
      setEmail('');
      setPassword('');
    }
    setAuthLoading(false);
  };

  const handleSignUp = async () => {
    setAuthLoading(true);
    setAuthError('');
    if (username.trim().length < 3) {
      setAuthError('Никнейм должен быть не короче 3 символов');
      setAuthLoading(false);
      return;
    }
    const { error } = await auth.signUp(email, password, username.trim());
    if (error) {
      setAuthError(error.message);
    } else {
      setShowAuthModal(false);
      setEmail('');
      setPassword('');
      setUsername('');
    }
    setAuthLoading(false);
  };

  const navItems: { key: ViewKey; label: string; icon: typeof Gamepad2 }[] = [
    { key: 'play', label: 'Играть', icon: Gamepad2 },
    { key: 'catalog', label: 'Каталог сборок', icon: LayoutGrid },
    { key: 'mods', label: 'Моды', icon: Package },
    { key: 'modpacks', label: 'Мои сборки', icon: Boxes },
    { key: 'versions', label: 'Версии MC', icon: Layers },
    { key: 'import', label: 'Импорт сборки', icon: FolderUp },
  ];

  if (showAdmin) {
    navItems.push({ key: 'admin', label: 'Админ-панель', icon: Shield });
  }

  const handleNavClick = (key: ViewKey) => {
    onViewChange(key);
    onMobileClose();
  };

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 md:hidden animate-fade-in" onClick={onMobileClose} />
      )}
      <aside className={`
        fixed md:relative z-40 h-full bg-launcher-surface border-r border-launcher-border flex flex-col w-72 max-w-[85vw]
        transition-transform duration-300
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-6 border-b border-launcher-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-launcher-primary to-launcher-primary-dim flex items-center justify-center">
              <Gamepad2 className="w-6 h-6 text-launcher-bg" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-launcher-text font-display tracking-wide">VERTEX</h1>
              <p className="text-[10px] text-launcher-muted tracking-[0.2em] uppercase">Launcher</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.key;
            const isAdminItem = item.key === 'admin';
            return (
              <button
                key={item.key}
                onClick={() => handleNavClick(item.key)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group ${
                  isActive
                    ? isAdminItem
                      ? 'bg-launcher-danger/15 text-launcher-danger'
                      : 'bg-launcher-primary/15 text-launcher-primary'
                    : 'text-launcher-muted hover:bg-launcher-elevated hover:text-launcher-text'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? (isAdminItem ? 'text-launcher-danger' : 'text-launcher-primary') : ''}`} />
                <span className="font-medium text-sm">{item.label}</span>
                {isActive && (
                  <div className={`ml-auto w-1.5 h-1.5 rounded-full ${isAdminItem ? 'bg-launcher-danger' : 'bg-launcher-primary'} animate-pulse`} />
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-launcher-border space-y-2">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-launcher-elevated/50">
            <div className="w-9 h-9 rounded-full bg-launcher-border flex items-center justify-center text-xs font-bold text-launcher-text">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-launcher-text truncate">{displayName}</p>
              <p className="text-[10px] text-launcher-muted truncate">
                {auth.session ? auth.session.user.email : 'Не вошёл в аккаунт'}
              </p>
            </div>
            {auth.session && (
              <button
                onClick={handleRefreshRole}
                disabled={refreshing}
                title="Обновить роль"
                className="p-1.5 rounded-md text-launcher-muted hover:text-launcher-primary hover:bg-launcher-bg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>

          {auth.profileError && (
            <p className="text-[10px] text-launcher-warning px-3">{auth.profileError}</p>
          )}

          {auth.session && (
            <button
              onClick={() => setShowSkinModal(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-launcher-muted hover:text-launcher-accent hover:bg-launcher-accent/10 transition-colors"
            >
              <Shirt className="w-4 h-4" />
              Скин
            </button>
          )}

          {auth.session ? (
            <button
              onClick={auth.signOut}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-launcher-muted hover:text-launcher-danger hover:bg-launcher-danger/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Выйти
            </button>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm bg-launcher-primary/10 text-launcher-primary hover:bg-launcher-primary/20 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              Войти в аккаунт
            </button>
          )}
        </div>
      </aside>

      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowAuthModal(false)}>
          <div className="w-full max-w-md bg-launcher-surface border border-launcher-border rounded-2xl p-8 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-launcher-text font-display">
                {authMode === 'login' ? 'Вход в аккаунт' : 'Регистрация'}
              </h2>
              <button onClick={() => setShowAuthModal(false)} className="text-launcher-muted hover:text-launcher-text transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex gap-2 mb-6 p-1 bg-launcher-bg rounded-lg">
              <button
                onClick={() => { setAuthMode('login'); setAuthError(''); }}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${authMode === 'login' ? 'bg-launcher-primary text-launcher-bg' : 'text-launcher-muted'}`}
              >
                Вход
              </button>
              <button
                onClick={() => { setAuthMode('register'); setAuthError(''); }}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${authMode === 'register' ? 'bg-launcher-primary text-launcher-bg' : 'text-launcher-muted'}`}
              >
                Регистрация
              </button>
            </div>

            <div className="space-y-4">
              {authMode === 'register' && (
                <div>
                  <label className="block text-xs text-launcher-muted mb-1.5 uppercase tracking-wide">Никнейм</label>
                  <div className="relative">
                    <input
                      ref={nicknameRef}
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-launcher-bg border border-launcher-border rounded-lg px-4 py-2.5 text-sm text-launcher-text focus:border-launcher-primary focus:outline-none transition-colors"
                      placeholder="Steve_Player"
                    />
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-launcher-muted" />
                  </div>
                  <p className="text-[10px] text-launcher-muted mt-1">Никнейм привязан к аккаунту и не может быть изменён вручную</p>
                </div>
              )}

              <div>
                <label className="block text-xs text-launcher-muted mb-1.5 uppercase tracking-wide">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-launcher-bg border border-launcher-border rounded-lg px-4 py-2.5 text-sm text-launcher-text focus:border-launcher-primary focus:outline-none transition-colors"
                  placeholder="player@example.com"
                />
              </div>

              <div>
                <label className="block text-xs text-launcher-muted mb-1.5 uppercase tracking-wide">Пароль</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (authMode === 'login' ? handleSignIn() : handleSignUp())}
                  className="w-full bg-launcher-bg border border-launcher-border rounded-lg px-4 py-2.5 text-sm text-launcher-text focus:border-launcher-primary focus:outline-none transition-colors"
                  placeholder="••••••••"
                />
              </div>

              {authError && (
                <div className="text-sm text-launcher-danger bg-launcher-danger/10 rounded-lg px-4 py-2.5">
                  {authError}
                </div>
              )}

              <button
                onClick={authMode === 'login' ? handleSignIn : handleSignUp}
                disabled={authLoading || !email || !password}
                className="w-full py-2.5 rounded-lg bg-launcher-primary text-launcher-bg font-bold text-sm hover:bg-launcher-primary-dim disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {authLoading ? (
                  <div className="w-5 h-5 border-2 border-launcher-bg/30 border-t-launcher-bg rounded-full animate-spin" />
                ) : authMode === 'login' ? (
                  <><LogIn className="w-4 h-4" /> Войти</>
                ) : (
                  <><UserPlus className="w-4 h-4" /> Создать аккаунт</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {showSkinModal && (
        <SkinModal onClose={() => setShowSkinModal(false)} />
      )}
    </>
  );
}
