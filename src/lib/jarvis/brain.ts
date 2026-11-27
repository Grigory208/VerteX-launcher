// JARVIS-мозг лаунчера: Ollama (локально) → Pollinations (бесплатный резерв).
// Без API-ключей и без голоса: только текст.

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const OLLAMA_URL = 'http://localhost:11434';
const OLLAMA_MODEL = 'qwen2.5:0.5b-instruct';
const POLLINATIONS_URL = 'https://text.pollinations.ai/openai';
const POLLINATIONS_MODEL = 'openai-fast';

export const JARVIS_SYSTEM = [
  'Ты — JARVIS, встроенный текстовый ассистент лаунчера VerteX (Minecraft).',
  'Отвечай по-русски, кратко и по делу, нейтральным техническим тоном (без "сэра" и театра).',
  'Ты помогаешь: собрать модпак, проверить совместимость модов, найти моды в Modrinth,',
  'объяснить ошибки запуска игры и подсказать настройки (память, Java, лоадеры).',
  'Модпаки: Fabric/Forge/NeoForge, версии Minecraft 1.16.5+ (основные цели — 1.21.x и 1.20.1).',
  'Также умеешь писать моды: команда «создай мод <название>» создаёт каркас Fabric-мода (Java + Gradle + fabric.mod.json) в папке jarvis-mods.',
  'Ещё ты художник: «нарисуй текстуру/скин/плащ <описание>» — интерфейс рисует пиксель-арт по твоей спецификации цветов.',
  'Когда просишь написать код для мода — выдавай Java/Kotlin код в markdown-блоках ``` и объясняй, в какой файл положить.',
  'Если просят собрать сборку — предложи список модов и скажи, что можно создать сборку командой',
  '"собери сборку под 1.21.x fabric: <мод1>, <мод2>".',
].join(' ');

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function askOllama(messages: ChatMsg[]): Promise<string> {
  const res = await fetchWithTimeout(
    `${OLLAMA_URL}/api/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: false }),
    },
    90_000,
  );
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('Ollama: пустой ответ');
  return text.trim();
}

async function askPollinations(messages: ChatMsg[]): Promise<string> {
  const res = await fetchWithTimeout(
    POLLINATIONS_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: POLLINATIONS_MODEL, messages, private: true }),
    },
    90_000,
  );
  if (!res.ok) throw new Error(`Pollinations HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('Pollinations: пустой ответ');
  return text.trim();
}

async function askPollinationsText(messages: ChatMsg[]): Promise<string> {
  // Тот же Pollinations, но text-эндпойнт: отвечает обычным текстом, не JSON.
  const res = await fetchWithTimeout(
    'https://text.pollinations.ai/',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: POLLINATIONS_MODEL, messages, private: true }),
    },
    90_000,
  );
  if (!res.ok) throw new Error(`Pollinations-Text HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trim() || /^\s*\{\s*\}\s*$/.test(text)) throw new Error('Pollinations-Text: пустой ответ');
  return text.trim();
}

async function askDuckDuckGo(messages: ChatMsg[]): Promise<string> {
  // DuckDuckGo AI Chat — без ключей. Двухшаговый: status -> x-vqd-4 -> chat (SSE).
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const st = await fetchWithTimeout(
    'https://duckduckgo.com/duckchat/v1/status',
    { headers: { 'x-vqd-accept': '1', 'User-Agent': UA } },
    20_000,
  );
  const vqd = st.headers.get('x-vqd-4') || st.headers.get('x-vqd');
  if (!vqd) throw new Error('DDG: не выдан x-vqd-4 токен');
  const res = await fetchWithTimeout(
    'https://duckduckgo.com/duckchat/v1/chat',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'x-vqd-4': vqd, 'User-Agent': UA,
        Accept: 'text/event-stream', 'x-vqd-hash-1': '1',
      },
      body: JSON.stringify({ model: 'llama-3.3-70b', messages, stream: true }),
    },
    90_000,
  );
  if (!res.ok) throw new Error(`DDG HTTP ${res.status}`);
  const raw = await res.text();
  let text = '';
  for (const line of raw.split('\n')) {
    const trim = line.trim();
    if (!trim.startsWith('data:')) continue;
    const payload = trim.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const j = JSON.parse(payload) as { message?: unknown };
      if (typeof j.message === 'string') text += j.message;
    } catch { /* мусорная строка SSE — пропускаем */ }
  }
  if (!text.trim()) throw new Error('DDG: пустой ответ');
  return text.trim();
}

/** Задать вопрос мозгу. Сначала локальная Ollama, при недоступности — облачные резервы. */
export async function brainAnswer(history: ChatMsg[], extraSystem?: string): Promise<string> {
  const messages: ChatMsg[] = [{ role: 'system', content: JARVIS_SYSTEM }];
  if (extraSystem) messages.push({ role: 'system', content: extraSystem });
  messages.push(...history);

  // В Electron — через main-процесс (нет CORS:_renderer часто заблокирован для localhost Ollama).
  const api = (window as unknown as { electronAPI?: { jarvisChat?: (m: ChatMsg[]) => Promise<string> } }).electronAPI;
  if (api?.jarvisChat) {
    return await api.jarvisChat(history);
  }

  const chain: [string, () => Promise<string>][] = [
    ['Ollama', () => askOllama(messages)],
    ['Pollinations', () => askPollinations(messages)],
    ['Pollinations-Text', () => askPollinationsText(messages)],
    ['DuckDuckGo', () => askDuckDuckGo(messages)],
  ];
  const errors: string[] = [];
  for (const [label, ask] of chain) {
    try {
      return await ask();
    } catch (e) {
      errors.push(`${label}: ${(e as Error).message}`);
    }
  }
  throw new Error(`Мозг недоступен (${errors.join('; ')}). Проверь интернет или запусти Ollama: ollama serve`);
}
