import { useEditor } from '@/hooks/useEditor';
import { Check, X, Palette, Move, RotateCcw, Type } from 'lucide-react';
import { useState } from 'react';

export function EditorToolbar() {
  const { editMode, handleSave, handleExit, selectedSelector, getOverride, updateOverride, resetStyles } = useEditor();

  if (!editMode) return null;

  return (
    <>
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-launcher-surface border border-launcher-primary/40 rounded-xl px-4 py-2.5 shadow-2xl animate-fade-in">
        <span className="text-sm font-display text-launcher-primary font-bold flex items-center gap-2">
          <Palette className="w-4 h-4" /> Режим редактирования
        </span>
        <div className="w-px h-6 bg-launcher-border" />
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-launcher-primary text-launcher-bg font-bold text-sm hover:bg-launcher-primary-dim transition-colors"
        >
          <Check className="w-4 h-4" /> Сохранить изменения
        </button>
        <button
          onClick={handleExit}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-launcher-elevated text-launcher-text font-medium text-sm hover:bg-launcher-border transition-colors"
        >
          <X className="w-4 h-4" /> Отменить изменения
        </button>
        <div className="w-px h-6 bg-launcher-border" />
        <button
          onClick={() => { if (confirm('Сбросить все изменения оформления?')) resetStyles(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-launcher-muted hover:text-launcher-danger text-sm transition-colors"
        >
          <RotateCcw className="w-4 h-4" /> Сброс
        </button>
      </div>

      {selectedSelector && <InspectorPanel selector={selectedSelector} />}
    </>
  );
}

function InspectorPanel({ selector }: { selector: string }) {
  const { getOverride, updateOverride } = useEditor();
  const ov = getOverride(selector);
  const [tab, setTab] = useState<'colors' | 'layout' | 'text'>('colors');

  return (
    <div className="fixed right-4 top-16 z-[100] w-64 bg-launcher-surface border border-launcher-border rounded-xl shadow-2xl animate-slide-up overflow-hidden">
      <div className="px-3 py-2 border-b border-launcher-border">
        <p className="text-[10px] text-launcher-muted truncate font-mono">{selector}</p>
      </div>
      <div className="flex border-b border-launcher-border">
        <TabBtn active={tab === 'colors'} onClick={() => setTab('colors')} icon={<Palette className="w-3.5 h-3.5" />} label="Цвет" />
        <TabBtn active={tab === 'layout'} onClick={() => setTab('layout')} icon={<Move className="w-3.5 h-3.5" />} label="Форма" />
        <TabBtn active={tab === 'text'} onClick={() => setTab('text')} icon={<Type className="w-3.5 h-3.5" />} label="Текст" />
      </div>

      <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto scrollbar-thin">
        {tab === 'colors' && (
          <>
            <ColorRow label="Фон" value={ov?.bgColor ?? ''} onChange={(v) => updateOverride(selector, { bgColor: v })} />
            <ColorRow label="Текст" value={ov?.textColor ?? ''} onChange={(v) => updateOverride(selector, { textColor: v })} />
            <ColorRow label="Граница" value={ov?.borderColor ?? ''} onChange={(v) => updateOverride(selector, { borderColor: v })} />
          </>
        )}
        {tab === 'layout' && (
          <>
            <NumberRow label="Ширина (px)" value={ov?.width} onChange={(v) => updateOverride(selector, v === undefined ? { width: undefined } : { width: v })} />
            <NumberRow label="Высота (px)" value={ov?.height} onChange={(v) => updateOverride(selector, v === undefined ? { height: undefined } : { height: v })} />
            <NumberRow label="Сдвиг X (px)" value={ov?.x} onChange={(v) => updateOverride(selector, v === undefined ? { x: undefined } : { x: v })} />
            <NumberRow label="Сдвиг Y (px)" value={ov?.y} onChange={(v) => updateOverride(selector, v === undefined ? { y: undefined } : { y: v })} />
            <SliderRow label="Скругление углов" value={ov?.borderRadius ?? 0} min={0} max={48} onChange={(v) => updateOverride(selector, { borderRadius: v })} />
            <div className="text-[10px] text-launcher-muted pt-1">Перетаскивайте элемент мышью для перемещения. Тяните за углы для изменения размера.</div>
          </>
        )}
        {tab === 'text' && (
          <SliderRow label="Размер шрифта" value={ov?.fontSize ?? 14} min={8} max={72} onChange={(v) => updateOverride(selector, { fontSize: v })} />
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${active ? 'text-launcher-primary border-b-2 border-launcher-primary' : 'text-launcher-muted hover:text-launcher-text'}`}
    >
      {icon} {label}
    </button>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-launcher-muted">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer bg-transparent border border-launcher-border"
        />
        <input
          type="text"
          value={value}
          placeholder="авто"
          onChange={(e) => onChange(e.target.value)}
          className="w-20 bg-launcher-bg border border-launcher-border rounded px-2 py-1 text-xs text-launcher-text focus:border-launcher-primary focus:outline-none"
        />
      </div>
    </div>
  );
}

function NumberRow({ label, value, onChange }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-launcher-muted">{label}</span>
      <input
        type="number"
        value={value ?? ''}
        placeholder="авто"
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') onChange(undefined);
          else { const n = Number(raw); if (!isNaN(n)) onChange(n); }
        }}
        className="w-20 bg-launcher-bg border border-launcher-border rounded px-2 py-1 text-xs text-launcher-text focus:border-launcher-primary focus:outline-none"
      />
    </div>
  );
}

function SliderRow({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-launcher-muted">{label}</span>
        <span className="text-xs text-launcher-text font-mono">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-launcher-primary"
      />
    </div>
  );
}
