# VerteX Skin Server

Единая точка выдачи скинов для клиентского мода `VertexSkinBridge`.
Мод ходит ТОЛЬКО сюда; сервер сам пробует провайдеров по порядку:

1. **Своя база** (Supabase, таблица `skin_claims`) — игроки, поставившие скин через VerteX-лаунчер.
2. **Mojang** (`api.mojang.com` → `sessionserver.mojang.com`) — лицензионные ники.
3. **Внешние хостинги/лаунчеры** — `ely.by` → `mc-heads.net` → `minotar.net` (бесплатно, без ключей).

Ответ: PNG + заголовок `X-Vertex-Skin-Model: classic|slim`.

## API

| Метод | Путь | Что делает |
|---|---|---|
| GET | `/skin/:name` | PNG скина для ника (или 404) |
| POST | `/claims` | `{ name, skinUrl, skinType }` — лаунчер регистрирует скин за ником |
| GET | `/health` | проверка живости |

## Деплой на Vercel (бесплатно)

```bash
cd skin-server
npm i -g vercel   # если ещё нет
vercel            # первый деплой
vercel env add SUPABASE_URL    # https://<проект>.supabase.co
vercel env add SUPABASE_KEY    # anon или service ключ (нужны права на skin_claims)
vercel --prod
```

Полученный URL (`https://<проект>.vercel.app`) прописать в `main.cjs`
(`SKIN_SERVER_URL`) или в env `VERTEX_SKIN_SERVER` — лаунчер положит его
моду в `<игра>/vertex-skin/config.json`.

## Запуск вне Vercel (layero, VPS, локально)

```bash
cd skin-server && npm install
SUPABASE_URL=... SUPABASE_KEY=... node api/index.js   # слушает :3000
```

## Разовая настройка Supabase

Выполнить в SQL Editor Supabase (или `supabase db push`):

```sql
-- supabase/migrations/20261126000000_007_create_skin_claims.sql
```

Создаёт таблицу `skin_claims` (name, skin_url, skin_type) с публичным
чтением и апсейтом — только эта таблица, остальное не трогает.
