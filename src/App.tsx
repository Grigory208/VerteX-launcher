import { useState, useCallback, useEffect } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { PlayView } from '@/components/PlayView';
import { CatalogView } from '@/components/CatalogView';
import { ModsView } from '@/components/ModsView';
import { ModpackEditorView } from '@/components/ModpackEditorView';
import { VersionsView } from '@/components/VersionsView';
import { ImportView } from '@/components/ImportView';
import { AdminView } from '@/components/AdminView';
import { EditorToolbar } from '@/components/EditorToolbar';
import { EditToggleButton } from '@/components/EditToggleButton';
import { EditorOverlay } from '@/components/EditorOverlay';
import { EditorProvider, useEditor } from '@/hooks/useEditor';
import { useAuth } from '@/hooks/useAuth';
import { useInstalledVersions } from '@/hooks/useInstalledVersions';
import type { ViewKey } from '@/types';

function AppContent() {
  const auth = useAuth();
  const [activeView, setActiveView] = useState<ViewKey>('play');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { refreshKey, triggerRefresh } = useInstalledVersions();
  const { editMode } = useEditor();

  const handleInstalledChange = useCallback(() => {
    triggerRefresh();
  }, [triggerRefresh]);

  const effectiveView = activeView === 'admin' && !auth.isAdmin ? 'play' : activeView;

  useEffect(() => {
    const handler = () => setActiveView('mods');
    window.addEventListener('navigate-to-mods', handler);
    return () => window.removeEventListener('navigate-to-mods', handler);
  }, []);

  // ⬇️ ДОБАВЛЕНО: Переход на вкладку "Мои сборки" ⬇️
  useEffect(() => {
    const handler = () => setActiveView('modpacks');
    window.addEventListener('navigate-to-modpacks', handler);
    return () => window.removeEventListener('navigate-to-modpacks', handler);
  }, []);

  return (
    <div className="h-screen w-screen flex bg-launcher-bg text-launcher-text overflow-hidden relative">
      <div className={`flex w-full h-full transition-all duration-300 ${editMode ? 'scale-[0.96] opacity-50 grayscale-[30%]' : ''}`}>
        <Sidebar
          activeView={effectiveView}
          onViewChange={setActiveView}
          auth={auth}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />
        <main className="flex-1 h-full overflow-hidden relative">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="md:hidden fixed top-3 left-3 z-20 p-2.5 rounded-lg bg-launcher-surface border border-launcher-border text-launcher-text"
            aria-label="Открыть меню"
          >
            <Menu className="w-5 h-5" />
          </button>

          {effectiveView === 'play' && <PlayView key={`play-${refreshKey}`} auth={auth} onInstalledChange={handleInstalledChange} />}
          {effectiveView === 'catalog' && <CatalogView key={`catalog-${refreshKey}`} onInstalledChange={handleInstalledChange} />}
          {effectiveView === 'mods' && <ModsView />}
          {effectiveView === 'modpacks' && <ModpackEditorView />}
          {effectiveView === 'versions' && <VersionsView />}
          {effectiveView === 'import' && <ImportView />}
          {effectiveView === 'admin' && auth.isAdmin && <AdminView />}
        </main>
      </div>

      <EditToggleButton />
      <EditorOverlay />
      <EditorToolbar />
    </div>
  );
}

function App() {
  return (
    <EditorProvider>
      <AppContent />
    </EditorProvider>
  );
}

export default App;