// Художник JARVIS: рисует пиксель-текстуры на <canvas> без внешних зависимостей.
// Мозг (LLM) придумывает СПЕКУ (палитра + паттерн), код рисует пиксели детерминированно
// (seeded RNG) — так у агента не бывает кривых «нарисованных» скинов: он описывает цвет,
// а геометрия гарантируется кодом.

export type TexKind = 'item' | 'block' | 'hud' | 'skin' | 'cape';

export interface TexSpec {
  kind: TexKind;
  colors: string[]; // 1-5 hex-цветов
  pattern: 'noise' | 'stripes' | 'gradient' | 'crystal' | 'panel' | 'border' | 'skin';
  eyes?: string; // для скина — цвет глаз
  detail?: number; // 0..100, шумность/детальность
  seed?: string;
}

export interface PaintResult {
  dataUrl: string;
  width: number;
  height: number;
  spec: TexSpec;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function safeColor(c: unknown, fallback: string): string {
  return typeof c === 'string' && HEX_RE.test(c) ? c.toLowerCase() : fallback;
}

function hashStr(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rngFactory(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Затемнение/осветление hex-цвета на -1..1. */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const lim = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = lim(((n >> 16) & 255) * (1 + amt));
  const g = lim(((n >> 8) & 255) * (1 + amt));
  const b = lim((n & 255) * (1 + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Достать JSON-объект из ответа мозга (обрезает болтовню вокруг). */
function extractJson(text: string): Record<string, unknown> | undefined {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return undefined;
  try {
    const j = JSON.parse(m[0]) as unknown;
    return j && typeof j === 'object' ? (j as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** Похмельный парсинг спеки из ответа мозга: жёсткая валидация, фолбэки. */
export function specFromText(kind: TexKind, query: string, brainText: string): TexSpec {
  const seed = `${kind}:${query}`;
  const j = extractJson(brainText) ?? {};
  let colors: string[] = [];
  const rawColors = (Array.isArray(j.colors) ? j.colors : [j.colors]) as unknown[];
  for (const c of rawColors) {
    if (typeof c === 'string' && HEX_RE.test(c)) colors.push(c.toLowerCase());
    if (colors.length >= 5) break;
  }
  if (!colors.length) {
    // Совсем без палитры — детерминированный набор из хэша запроса.
    const rng = rngFactory(hashStr(seed));
    const h = Math.floor(rng() * 360);
    colors = [hslHex(h, 0.45, 0.52), '#333333'];
  }
  let pattern: TexSpec['pattern'] = 'noise';
  const p = typeof j.pattern === 'string' ? j.pattern.toLowerCase() : '';
  if (['noise', 'stripes', 'gradient', 'crystal', 'panel', 'border'].includes(p)) {
    pattern = p as TexSpec['pattern'];
  } else if (kind === 'hud') {
    pattern = 'panel';
  } else if (kind === 'cape') {
    pattern = 'gradient';
  }
  const spec: TexSpec = {
    kind,
    colors,
    pattern,
    detail: typeof j.detail === 'number' ? Math.max(0, Math.min(100, j.detail)) : 45,
    seed,
  };
  if (kind === 'skin') {
    const c = (j.colors ?? {}) as Record<string, unknown>;
    if (!Array.isArray(j.colors)) {
      spec.colors = [
        safeColor(c.shirt, '#3f5fbf'),
        safeColor(c.pants, '#2e2e38'),
        safeColor(c.skin, '#e8b68f'),
        safeColor(c.hair, '#2b2b2b'),
        safeColor(c.shoes, '#1b1b1f'),
      ];
    }
    spec.eyes = safeColor(j.eyes, '#3ad0ff');
    spec.pattern = 'skin';
  }
  if (kind === 'cape' && spec.colors.length < 2) spec.colors.push(shade(spec.colors[0], 0.2));
  return spec;
}

function hslHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (k: number) => {
    const x = (k + h / 30) % 12;
    const v = l - a * Math.max(Math.min(x - 3, 9 - x, 1), -1);
    return Math.round(255 * v);
  };
  return `#${((f(0) << 16) | (f(8) << 8) | f(4)).toString(16).padStart(6, '0')}`;
}

export const PAINTER_PROMPT =
  'Ты — генератор спецификаций пиксель-текстур Minecraft для мода VerteX. ' +
  'Верни ТОЛЬКО JSON, без пояснений и без огласовок текста.\n' +
  'Для предмета/блока/HUD: {"colors":["#hex", ...до 5],"pattern":"noise|stripes|gradient|crystal|panel|border","detail":0-100}\n' +
  'Для скина: {"colors":{"skin":"#hex","hair":"#hex","shirt":"#hex","pants":"#hex","shoes":"#hex"},"eyes":"#hex"}\n' +
  'Палитра согласуй с запросом (для «алмазного меча» — бирюза, для «деревянного» — коричневый).';

function mkCanvas(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas 2d недоступен');
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

function fillNoiseRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colors: string[],
  rng: () => number,
  dirt = 0.55,
): void {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      const base = colors[Math.floor(rng() * colors.length)];
      const shadeAmt = (rng() - 0.5) * 2 * dirt * 0.12;
      ctx.fillStyle = shade(base, shadeAmt);
      ctx.fillRect(px, py, 1, 1);
    }
  }
}

function drawPattern(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  spec: TexSpec,
  rng: () => number,
): void {
  const colors = spec.colors;
  const noise = (spec.detail ?? 45) / 100;
  if (spec.pattern === 'noise') {
    fillNoiseRect(ctx, 0, 0, w, h, colors, rng, noise);
  } else if (spec.pattern === 'stripes') {
    const band = Math.max(2, Math.floor(w / (colors.length + 2)));
    for (let x = 0; x < w; x++) {
      const base = colors[Math.floor(x / band) % colors.length];
      for (let y = 0; y < h; y++) {
        ctx.fillStyle = shade(base, (rng() - 0.5) * 0.18);
        ctx.fillRect(x, y, 1, 1);
      }
    }
  } else if (spec.pattern === 'gradient') {
    const top = colors[0];
    const bottom = colors[colors.length - 1];
    for (let y = 0; y < h; y++) {
      const t = y / Math.max(1, h - 1);
      const mixed = mixHex(top, bottom, t);
      for (let x = 0; x < w; x++) {
        ctx.fillStyle = shade(mixed, (rng() - 0.5) * 0.1);
        ctx.fillRect(x, y, 1, 1);
      }
    }
  } else if (spec.pattern === 'crystal') {
    // Ромб-«самоцвет» на тёмном фоне — каноничная текстура гема.
    ctx.fillStyle = shade(colors[0], -0.5);
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    const halfBase = w * 0.38;
    for (let y = 0; y < h; y++) {
      const t = Math.abs(y - (h / 2)) / (h / 2);
      const half = Math.max(0, Math.round(halfBase * (1 - t * t)));
      for (let x = Math.round(cx - half); x < Math.round(cx + half); x++) {
        const edge = Math.abs(x - cx) / Math.max(1, half);
        ctx.fillStyle = shade(colors[0], 0.25 - edge * 0.4 + (rng() - 0.5) * 0.1);
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.fillStyle = shade(colors[0], 0.6);
    ctx.fillRect(Math.round(cx - 1), Math.round(h * 0.2), 2, 2);
  } else if (spec.pattern === 'panel') {
    // HUD-панель: рамка, затемнение внутри, «светодиодная» строка.
    ctx.fillStyle = shade(colors[0], -0.6);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = shade(colors[0], -0.35);
    ctx.fillRect(1, 1, w - 2, h - 2);
    ctx.strokeStyle = shade(colors[0], 0.3);
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    if (colors[1]) {
      for (let i = 0; i < Math.max(2, Math.floor(w / 16)); i++) {
        ctx.fillStyle = rng() > 0.35 ? colors[1] : shade(colors[1], -0.4);
        ctx.fillRect(4 + i * 8, 3, 5, 3);
      }
    }
  } else {
    // border: заливка + тёмная окантовка + блик
    ctx.fillStyle = colors[0];
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = shade(colors[0], -0.4);
    ctx.fillRect(0, 0, w, 1);
    ctx.fillRect(0, h - 1, w, 1);
    ctx.fillRect(0, 0, 1, h);
    ctx.fillRect(w - 1, 0, 1, h);
    fillNoiseRect(ctx, 2, 2, w - 4, h - 4, colors, rng, noise * 0.5);
  }
}

function mixHex(a: string, b: string, t: number): string {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const r = Math.round(((na >> 16) & 255) * (1 - t) + ((nb >> 16) & 255) * t);
  const g = Math.round(((na >> 8) & 255) * (1 - t) + ((nb >> 8) & 255) * t);
  const bl = Math.round((na & 255) * (1 - t) + (nb & 255) * t);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}

function drawSkin(ctx: CanvasRenderingContext2D, spec: TexSpec): void {
  const [shirt, pants, skin, hair, shoes] = spec.colors;
  const rng = rngFactory(hashStr(spec.seed ?? 'skin'));
  const face = (x: number, y: number, c: string) => {
    ctx.fillStyle = shade(c, (rng() - 0.5) * 0.06);
    ctx.fillRect(x, y, 1, 1);
  };
  // Голова: вся bounding-область волосами слева/сзади, лицевая грань кожей
  fillNoiseRect(ctx, 0, 0, 32, 16, [hair, shoes], rng, 0.4);
  fillNoiseRect(ctx, 8, 8, 8, 8, [skin], rng, 0.25);
  // Чёлка
  fillNoiseRect(ctx, 8, 8, 8, 2, [hair], rng, 0.2);
  // Глаза + рот
  for (const [ex, ey] of [[10, 12], [13, 12]] as const) {
    ctx.fillStyle = spec.eyes ?? '#3ad0ff';
    ctx.fillRect(ex, ey, 2, 1);
  }
  ctx.fillStyle = shade(skin, -0.25);
  ctx.fillRect(11, 14, 2, 1);
  // Торс (обе боковые/задняя области тоже рубашкой)
  fillNoiseRect(ctx, 16, 16, 24, 16, [shirt, shade(shirt, -0.12)], rng, 0.3);
  // Правая рука
  fillNoiseRect(ctx, 40, 16, 16, 16, [shirt, skin], rng, 0.3);
  fillNoiseRect(ctx, 44, 20, 4, 12, [skin], rng, 0.25);
  // Левая рука
  fillNoiseRect(ctx, 32, 48, 16, 16, [shirt, skin], rng, 0.3);
  fillNoiseRect(ctx, 36, 52, 4, 12, [skin], rng, 0.25);
  // Правая и левая нога (штаны + ботинки)
  fillNoiseRect(ctx, 0, 16, 16, 16, [pants, shade(pants, -0.12)], rng, 0.3);
  fillNoiseRect(ctx, 4, 20, 4, 9, [pants], rng, 0.25);
  fillNoiseRect(ctx, 4, 29, 4, 3, [shoes], rng, 0.2);
  fillNoiseRect(ctx, 16, 48, 16, 16, [pants, shade(pants, -0.12)], rng, 0.3);
  fillNoiseRect(ctx, 20, 52, 4, 9, [pants], rng, 0.25);
  fillNoiseRect(ctx, 20, 61, 4, 3, [shoes], rng, 0.2);
  for (let i = 0; i < 200; i++) face(Math.floor(rng() * 64), 16 + Math.floor(rng() * 48), shirt);
}

function drawCape(ctx: CanvasRenderingContext2D, spec: TexSpec): void {
  const rng = rngFactory(hashStr(spec.seed ?? 'cape'));
  // Полотно плаща 64x32: перед — (1,1)-(11,17)
  fillNoiseRect(ctx, 0, 0, 64, 32, [spec.colors[0], shade(spec.colors[0], -0.15)], rng, 0.35);
  fillNoiseRect(ctx, 1, 1, 10, 16, [spec.colors[1] ?? spec.colors[0]], rng, 0.3);
  // Верхняя/нижняя кромка
  fillNoiseRect(ctx, 1, 1, 10, 1, [shade(spec.colors[0], 0.3)], rng, 0.2);
  fillNoiseRect(ctx, 1, 16, 10, 1, [shade(spec.colors[0], 0.15)], rng, 0.2);
  // «Знак» по центру, если есть третий цвет
  if (spec.colors[2]) {
    ctx.fillStyle = spec.colors[2];
    ctx.fillRect(5, 6, 3, 3);
  }
}

/** Нарисовать по спеке; возвращает dataURL PNG и размеры. */
export function renderTex(spec: TexSpec): PaintResult {
  const size = spec.kind === 'hud' ? { w: 128, h: 32 } : spec.kind === 'skin' ? { w: 64, h: 64 } : spec.kind === 'cape' ? { w: 64, h: 32 } : { w: 16, h: 16 };
  const { c, ctx } = mkCanvas(size.w, size.h);
  ctx.clearRect(0, 0, size.w, size.h);
  if (spec.kind === 'skin') drawSkin(ctx, spec);
  else if (spec.kind === 'cape') drawCape(ctx, spec);
  else drawPattern(ctx, size.w, size.h, spec, rngFactory(hashStr(spec.seed ?? 'tex')));
  return { dataUrl: c.toDataURL('image/png'), width: size.w, height: size.h, spec };
}
