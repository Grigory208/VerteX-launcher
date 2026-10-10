import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

export interface StyleOverride {
  selector: string;
  bgColor?: string;
  textColor?: string;
  borderColor?: string;
  borderRadius?: number;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  fontSize?: number;
}

type OverrideMap = Record<string, StyleOverride>;

interface EditorContextValue {
  editMode: boolean;
  enterEditMode: () => void;
  handleSave: () => void;
  handleExit: () => void;
  selectedSelector: string | null;
  selectElement: (selector: string | null) => void;
  getOverride: (selector: string) => StyleOverride | undefined;
  updateOverride: (selector: string, patch: Partial<StyleOverride>) => void;
  resetStyles: () => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);
const STORAGE_KEY = 'vertex-editor-styles';

function loadStyles(): OverrideMap {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as OverrideMap;
  } catch { /* ignore */ }
  return {};
}

function overrideToCss(o: StyleOverride): string {
  const props: string[] = [];
  if (o.bgColor) props.push(`background-color: ${o.bgColor} !important`);
  if (o.textColor) props.push(`color: ${o.textColor} !important`);
  if (o.borderColor) props.push(`border-color: ${o.borderColor} !important`);
  if (o.borderRadius !== undefined) props.push(`border-radius: ${o.borderRadius}px !important`);
  if (o.width) props.push(`width: ${o.width}px !important`);
  if (o.height) props.push(`height: ${o.height}px !important`);
  if (o.fontSize) props.push(`font-size: ${o.fontSize}px !important`);
  if (o.x !== undefined || o.y !== undefined) {
    props.push(`position: relative !important`);
    props.push(`transform: translate(${o.x ?? 0}px, ${o.y ?? 0}px) !important`);
  }
  return props.length ? `${o.selector} { ${props.join('; ')} }` : '';
}

export function EditorProvider({ children }: { children: ReactNode }) {
  const [editMode, setEditMode] = useState(false);
  const [selectedSelector, setSelectedSelector] = useState<string | null>(null);
  const [styles, setStyles] = useState<OverrideMap>(loadStyles);
  const [snapshot, setSnapshot] = useState<OverrideMap | null>(null);

  useEffect(() => {
    const styleId = 'vertex-editor-overrides';
    let tag = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!tag) {
      tag = document.createElement('style');
      tag.id = styleId;
      document.head.appendChild(tag);
    }
    const css = Object.values(styles).map(overrideToCss).filter(Boolean).join('\n');
    tag.textContent = css;
  }, [styles]);

  useEffect(() => {
    const api = window.electronAPI;
    if (api?.getEditorStyles) {
      api.getEditorStyles().then((saved) => {
        if (saved && typeof saved === 'object' && Object.keys(saved).length > 0) {
          setStyles(saved as OverrideMap);
        }
      }).catch(() => undefined);
    }
  }, []);

  const enterEditMode = useCallback(() => {
    setSnapshot(JSON.parse(JSON.stringify(styles)));
    setEditMode(true);
    setSelectedSelector(null);
  }, [styles]);

  const handleExit = useCallback(() => {
    if (snapshot) {
      setStyles(snapshot);
      setSnapshot(null);
    }
    setEditMode(false);
    setSelectedSelector(null);
  }, [snapshot]);

  const handleSave = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(styles));
    const api = window.electronAPI;
    if (api?.saveEditorStyles) {
      api.saveEditorStyles(styles).catch(() => undefined);
    }
    setSnapshot(null);
    setEditMode(false);
    setSelectedSelector(null);
  }, [styles]);

  const selectElement = useCallback((selector: string | null) => {
    setSelectedSelector(selector);
  }, []);

  const updateOverride = useCallback((selector: string, patch: Partial<StyleOverride>) => {
    setStyles((prev) => {
      const current = prev[selector] ?? { selector };
      return { ...prev, [selector]: { ...current, ...patch, selector } };
    });
  }, []);

  const getOverride = useCallback((selector: string) => styles[selector], [styles]);

  const resetStyles = useCallback(() => {
    setStyles({});
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const value: EditorContextValue = {
    editMode,
    enterEditMode,
    handleSave,
    handleExit,
    selectedSelector,
    selectElement,
    getOverride,
    updateOverride,
    resetStyles,
  };

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used within EditorProvider');
  return ctx;
}
