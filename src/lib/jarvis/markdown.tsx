// Сверхлёгкий markdown для пузырей чата: заголовки, списки, **жирный**, *курсив*,
// `код`, ссылки [t](u) и голые URL. Без внешних зависимостей.
import type { ReactNode } from 'react';

function inline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re =
    /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s)<>]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith('**')) {
      nodes.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith('`')) {
      nodes.push(
        <code key={k} className="px-1 rounded bg-launcher-elevated text-[0.85em]">
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith('[')) {
      const mm = tok.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (mm) {
        nodes.push(
          <a key={k} href={mm[2]} target="_blank" rel="noreferrer" className="text-launcher-accent underline">
            {mm[1]}
          </a>,
        );
      } else nodes.push(tok);
    } else if (tok.startsWith('http')) {
      nodes.push(
        <a key={k} href={tok} target="_blank" rel="noreferrer" className="text-launcher-accent underline break-all">
          {tok}
        </a>,
      );
    } else {
      nodes.push(<em key={k}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const lines = text.replace(/\r/g, '').split('\n');
  let list: ReactNode[] = [];
  const flushList = (key: string) => {
    if (list.length) {
      out.push(
        <ul key={key} className="list-disc pl-5 my-1 space-y-0.5">
          {list}
        </ul>,
      );
      list = [];
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    const li = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (!line.trim()) {
      flushList(`u${i}`);
    } else if (h) {
      flushList(`u${i}`);
      const big = h[1].length <= 2;
      out.push(
        <div key={`h${i}`} className={`font-semibold mb-0.5 ${big ? 'text-[0.95em]' : ''}`}>
          {inline(h[2], `h${i}`)}
        </div>,
      );
    } else if (li) {
      list.push(<li key={`l${i}`}>{inline(li[1], `l${i}`)}</li>);
    } else {
      out.push(
        <div key={`p${i}`} className="min-h-[1em]">
          {inline(line, `p${i}`)}
        </div>,
      );
    }
  });
  flushList('u-end');
  return <span>{out}</span>;
}
