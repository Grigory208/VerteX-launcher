/**
 * VerteX Skin Server — Express (деплой на Vercel или любой node-хостинг).
 *
 * Единственная точка входа для клиентского мода VertexSkinBridge:
 *   GET  /skin/:name  → PNG скина + заголовок X-Vertex-Skin-Model (classic|slim)
 *   POST /claims      → { name, skinUrl, skinType } — лаунчер регистрирует скин игрока
 *   GET  /health      → { ok: true }
 *
 * Цепочка провайдеров (первый успешный побеждает):
 *   1. Своя база (Supabase, таблица skin_claims) — игроки, у которых стоит скин из VerteX-лаунчера.
 *   2. Mojang (api.mojang.com → sessionserver.mojang.com) — лицензионные ники.
 *   3. Внешние хостинги/лаунчеры: ely.by → mc-heads.net → minotar.net.
 *
 * Всё скачивается СЕРВЕРОМ и отдаётся клиенту в виде готового PNG — мод не ходит
 * напрямую в Mojang, чтобы не зависеть от блокировок и получать модель (slim/classic).
 *
 * Env: SUPABASE_URL, SUPABASE_KEY (anon/service — достаточно прав на skin_claims).
 */
const express = require('express');
const serverless = require('serverless-http');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

const app = express();
app.use(express.json({ limit: '256kb' }));

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const UA = 'VerteX-Launcher skin-server/1.0';

function sbHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/** 1. Своя база: ник → активный скин. */
async function getClaim(name) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const url = `${SUPABASE_URL}/rest/v1/skin_claims?name=eq.${encodeURIComponent(name)}&select=skin_url,skin_type&limit=1`;
    const r = await fetch(url, { headers: sbHeaders() });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

/** Скачиваем PNG с проверкой подписи и разумного размера. */
async function fetchPng(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: 'image/png,image/*' },
      redirect: 'follow',
    });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 70 || buf.length > 5 * 1024 * 1024) return null;
    if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
    return buf;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 2. Mojang: ник → uuid → подписанные текстуры профиля. */
async function fromMojang(name) {
  try {
    const r1 = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`, {
      headers: { 'User-Agent': UA },
    });
    if (!r1.ok) return null;
    const profile = await r1.json();
    if (!profile || !profile.id) return null;

    const r2 = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${profile.id}?unsigned=false`, {
      headers: { 'User-Agent': UA },
    });
    if (!r2.ok) return null;
    const data = await r2.json();
    const prop = (data.properties || []).find((p) => p.name === 'textures');
    if (!prop) return null;
    const textures = JSON.parse(Buffer.from(prop.value, 'base64').toString('utf8'));
    const skin = textures.textures && textures.textures.SKIN;
    if (!skin || !skin.url) return null;
    const png = await fetchPng(skin.url);
    if (!png) return null;
    const model = skin.metadata && skin.metadata.model === 'slim' ? 'slim' : 'classic';
    return { png, model };
  } catch {
    return null;
  }
}

/** 3. Внешние хостинги и лаунчеры (бесплатно, без ключей). */
const FALLBACKS = [
  { name: 'ely.by', url: (n) => `https://skinsystem.ely.by/skins/${encodeURIComponent(n)}.png` },
  { name: 'mc-heads.net', url: (n) => `https://mc-heads.net/skin/${encodeURIComponent(n)}` },
  { name: 'minotar.net', url: (n) => `https://minotar.net/skin/${encodeURIComponent(n)}` },
];

function sendSkin(res, png, model, source) {
  res.set('Content-Type', 'image/png');
  res.set('X-Vertex-Skin-Model', model === 'slim' ? 'slim' : 'classic');
  res.set('X-Vertex-Skin-Source', source);
  res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
  res.status(200).send(png);
}

app.get('/skin/:name', async (req, res) => {
  const name = String(req.params.name || '').trim();
  if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) {
    return res.status(400).json({ error: 'bad nickname' });
  }
  try {
    // 1. своя база
    const claim = await getClaim(name);
    if (claim && claim.skin_url) {
      const png = await fetchPng(claim.skin_url);
      if (png) return sendSkin(res, png, claim.skin_type || 'classic', 'vertex-db');
    }
    // 2. Mojang
    const mj = await fromMojang(name);
    if (mj) return sendSkin(res, mj.png, mj.model, 'mojang');
    // 3. внешние хостинги
    for (const p of FALLBACKS) {
      const png = await fetchPng(p.url(name));
      if (png) return sendSkin(res, png, 'classic', p.name);
    }
    return res.status(404).json({ error: 'skin not found' });
  } catch (e) {
    return res.status(502).json({ error: 'upstream failed' });
  }
});

app.post('/claims', async (req, res) => {
  const { name, skinUrl, skinType } = req.body || {};
  if (!name || !/^[A-Za-z0-9_]{1,16}$/.test(String(name))) {
    return res.status(400).json({ error: 'bad nickname' });
  }
  if (!skinUrl || !/^https:\/\//.test(String(skinUrl))) {
    return res.status(400).json({ error: 'bad skinUrl (только https)' });
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(503).json({ error: 'SUPABASE_URL/SUPABASE_KEY не настроены' });
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/skin_claims?on_conflict=name`, {
      method: 'POST',
      headers: sbHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({
        name: String(name),
        skin_url: String(skinUrl),
        skin_type: skinType === 'slim' ? 'slim' : 'classic',
      }),
    });
    if (!r.ok) {
      const detail = await r.text();
      return res.status(502).json({ error: `supabase: ${detail.slice(0, 200)}` });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: 'supabase unreachable' });
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true, db: Boolean(SUPABASE_URL && SUPABASE_KEY) });
});

module.exports = app;
module.exports.handler = serverless(app);

// Локальный запуск / layero и т.п.: node api/index.js
if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`[skin-server] слушаю :${port}`));
}
