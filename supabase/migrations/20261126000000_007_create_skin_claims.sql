-- skin_claims: ник в игре → активный скин игрока VerteX.
-- Сервер скинов читает эту таблицу, чтобы отдавать скины игроков VerteX другим клиентам мода.
create table if not exists public.skin_claims (
  name text primary key,
  skin_url text not null,
  skin_type text not null default 'classic',
  updated_at timestamptz not null default now()
);

alter table public.skin_claims enable row level security;

drop policy if exists "skin_claims_public_read" on public.skin_claims;
create policy "skin_claims_public_read"
  on public.skin_claims for select using (true);

drop policy if exists "skin_claims_public_upsert" on public.skin_claims;
create policy "skin_claims_public_upsert"
  on public.skin_claims for insert with check (true);

drop policy if exists "skin_claims_public_update" on public.skin_claims;
create policy "skin_claims_public_update"
  on public.skin_claims for update using (true) with check (true);
