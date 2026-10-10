import { Pencil } from 'lucide-react';
import { useEditor } from '@/hooks/useEditor';

export function EditToggleButton() {
  const { editMode, enterEditMode } = useEditor();

  if (editMode) return null;

  return (
    <button
      onClick={enterEditMode}
      className="fixed top-4 right-4 z-[80] flex items-center gap-2 px-4 py-2.5 rounded-xl bg-launcher-surface/90 backdrop-blur-sm border border-launcher-border text-launcher-muted hover:text-launcher-primary hover:border-launcher-primary/50 text-sm font-medium shadow-lg transition-all animate-fade-in"
    >
      <Pencil className="w-4 h-4" />
      Редактировать экран
    </button>
  );
}
