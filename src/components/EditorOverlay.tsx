import { useRef, useState, useEffect, useCallback } from 'react';
import { useEditor } from '@/hooks/useEditor';

function generateSelector(el: HTMLElement): string {
  const root = document.getElementById('root');
  const parts: string[] = [];
  let current: HTMLElement = el;
  while (current && current !== root && current !== document.body) {
    const parent = current.parentElement;
    if (!parent) break;
    const sameTag = Array.from(parent.children).filter(c => c.tagName === current!.tagName);
    if (sameTag.length > 1) {
      const index = sameTag.indexOf(current) + 1;
      parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${index})`);
    } else {
      parts.unshift(current.tagName.toLowerCase());
    }
    current = parent;
  }
  return parts.join(' > ');
}

interface DragState {
  type: 'move' | 'resize';
  handle?: string;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
  minW: number;
  minH: number;
}

const HANDLES = [
  { dir: 'nw', cursor: 'nwse-resize' },
  { dir: 'n', cursor: 'ns-resize' },
  { dir: 'ne', cursor: 'nesw-resize' },
  { dir: 'e', cursor: 'ew-resize' },
  { dir: 'se', cursor: 'nwse-resize' },
  { dir: 's', cursor: 'ns-resize' },
  { dir: 'sw', cursor: 'nesw-resize' },
  { dir: 'w', cursor: 'ew-resize' },
];

const HANDLE_SIZE = 10;

function handlePos(dir: string, r: DOMRect): { left: number; top: number } {
  const s = HANDLE_SIZE / 2;
  switch (dir) {
    case 'nw': return { left: r.left - s, top: r.top - s };
    case 'n': return { left: r.left + r.width / 2 - s, top: r.top - s };
    case 'ne': return { left: r.right - s, top: r.top - s };
    case 'e': return { left: r.right - s, top: r.top + r.height / 2 - s };
    case 'se': return { left: r.right - s, top: r.bottom - s };
    case 's': return { left: r.left + r.width / 2 - s, top: r.bottom - s };
    case 'sw': return { left: r.left - s, top: r.bottom - s };
    case 'w': return { left: r.left - s, top: r.top + r.height / 2 - s };
    default: return { left: 0, top: 0 };
  }
}

export function EditorOverlay() {
  const { editMode, selectedSelector, selectElement, getOverride, updateOverride } = useEditor();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const dragState = useRef<DragState | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const refreshRect = useCallback(() => {
    if (selectedEl) setRect(selectedEl.getBoundingClientRect());
  }, [selectedEl]);

  useEffect(() => {
    if (!selectedEl) return;
    const update = () => setRect(selectedEl.getBoundingClientRect());
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [selectedEl]);

  // Global mouse listeners during drag — keyed on isDragging state so React re-subscribes
  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent) => {
      const ds = dragState.current;
      if (!ds || !selectedSelector) return;
      e.preventDefault();

      const dx = e.clientX - ds.startX;
      const dy = e.clientY - ds.startY;

      if (ds.type === 'move') {
        updateOverride(selectedSelector, {
          x: Math.round(ds.origX + dx),
          y: Math.round(ds.origY + dy),
        });
      } else if (ds.type === 'resize' && ds.handle) {
        let newW = ds.origW;
        let newH = ds.origH;
        let newX = ds.origX;
        let newY = ds.origY;

        const h = ds.handle;
        if (h.includes('e')) newW = Math.max(ds.minW, ds.origW + dx);
        if (h.includes('s')) newH = Math.max(ds.minH, ds.origH + dy);
        if (h.includes('w')) {
          const maxDx = ds.origW - ds.minW;
          const clampedDx = Math.min(dx, maxDx);
          newW = ds.origW - clampedDx;
          newX = ds.origX + clampedDx;
        }
        if (h.includes('n')) {
          const maxDy = ds.origH - ds.minH;
          const clampedDy = Math.min(dy, maxDy);
          newH = ds.origH - clampedDy;
          newY = ds.origY + clampedDy;
        }

        updateOverride(selectedSelector, {
          width: Math.round(newW),
          height: Math.round(newH),
          x: Math.round(newX),
          y: Math.round(newY),
        });
      }

      requestAnimationFrame(refreshRect);
    };

    const onUp = () => {
      dragState.current = null;
      setIsDragging(false);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, selectedSelector, updateOverride, refreshRect]);

  const startDrag = (e: React.MouseEvent, type: 'move' | 'resize', handle?: string) => {
    if (!editMode || !selectedEl || !selectedSelector) return;
    e.stopPropagation();
    e.preventDefault();

    const r = selectedEl.getBoundingClientRect();
    const ov = getOverride(selectedSelector);

    dragState.current = {
      type,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origX: ov?.x ?? 0,
      origY: ov?.y ?? 0,
      origW: ov?.width ?? r.width,
      origH: ov?.height ?? r.height,
      minW: 20,
      minH: 20,
    };
    setIsDragging(true);
  };

  const handleOverlayMouseDown = (e: React.MouseEvent) => {
    if (!editMode) return;
    const target = e.target as HTMLElement;
    const handle = target.dataset.handle;

    if (handle) {
      startDrag(e, 'resize', handle);
      return;
    }

    if (!overlayRef.current) return;
    const elements = document.elementsFromPoint(e.clientX, e.clientY);
    const el = elements.find(el =>
      el !== overlayRef.current &&
      !overlayRef.current?.contains(el) &&
      el instanceof HTMLElement
    ) as HTMLElement | undefined;

    if (!el) {
      selectElement(null);
      setSelectedEl(null);
      setRect(null);
      return;
    }

    const selector = generateSelector(el);
    selectElement(selector);
    setSelectedEl(el);
    setRect(el.getBoundingClientRect());
    startDrag(e, 'move');
  };

  if (!editMode) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[90]"
      style={{ cursor: 'crosshair' }}
      onMouseDown={handleOverlayMouseDown}
    >
      {rect && selectedSelector && (
        <div
          className="absolute border-2 border-launcher-primary pointer-events-none"
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        />
      )}
      {rect && selectedSelector && HANDLES.map(h => {
        const pos = handlePos(h.dir, rect);
        return (
          <div
            key={h.dir}
            data-handle={h.dir}
            className="absolute z-[91]"
            style={{
              left: pos.left,
              top: pos.top,
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              backgroundColor: '#00e676',
              border: '2px solid #0a0e16',
              borderRadius: 2,
              cursor: h.cursor,
            }}
          />
        );
      })}
    </div>
  );
}
