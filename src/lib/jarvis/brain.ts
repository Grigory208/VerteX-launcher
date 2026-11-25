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

/** Задать вопрос мозгу. Сначала локальная Ollama, при недоступности — Pollinations. */
export async function brainAnswer(history: ChatMsg[], extraSystem?: string): Promise<string> {
  const messages: ChatMsg[] = [{ role: 'system', content: JARVIS_SYSTEM }];
  if (extraSystem) messages.push({ role: 'system', content: extraSystem });
  messages.push(...history);

  // В Electron — через main-процесс (нет CORS:_renderer часто заблокирован для localhost Ollama).
  const api = (window as unknown as { electronAPI?: { jarvisChat?: (m: ChatMsg[]) => Promise<string> } }).electronAPI;
  if (api?.jarvisChat) {
    return await api.jarvisChat(history);
  }

  try {
    return await askOllama(messages);
  } catch (ollamaErr) {
    try {
      return await askPollinations(messages);
    } catch {
      throw new Error(
        `Мозг недоступен: Ollama (${(ollamaErr as Error).message}), Pollinations тоже не ответил. ` +
        'Проверь интернет или запусти Ollama: ollama serve',
      );
    }
  }
}
