-- Rode este arquivo no SQL Editor do Supabase.
-- Depois execute, separadamente, os INSERTs de e-mail descritos no README.
create extension if not exists pgcrypto;

create table if not exists public.allowed_members (
  email text primary key,
  constraint email_normalized check (email = lower(trim(email)))
);

create table if not exists public.titles (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 160),
  kind text not null default 'filme' check (kind in ('filme', 'serie')),
  availability text not null default 'pendente' check (availability in ('pendente', 'sim', 'nao')),
  progress text not null default 'quero' check (progress in ('quero', 'assistindo', 'assistido')),
  reel_url text check (reel_url is null or char_length(reel_url) <= 1500),
  note text check (note is null or char_length(note) <= 300),
  tmdb_id bigint,
  poster_path text,
  created_at timestamptz not null default now()
);

alter table public.allowed_members enable row level security;
alter table public.titles enable row level security;

revoke all on public.allowed_members from anon;
revoke all on public.titles from anon;
grant select on public.allowed_members to authenticated;
grant select, insert, update, delete on public.titles to authenticated;

-- O usuário só consegue consultar se seu próprio e-mail está na lista.
create policy "Ver propria permissao" on public.allowed_members
  for select to authenticated
  using (email = lower(auth.jwt() ->> 'email'));

create policy "Ver titulos para membros" on public.titles
  for select to authenticated
  using (exists (select 1 from public.allowed_members where email = lower(auth.jwt() ->> 'email')));
create policy "Inserir titulos para membros" on public.titles
  for insert to authenticated
  with check (exists (select 1 from public.allowed_members where email = lower(auth.jwt() ->> 'email')));
create policy "Editar titulos para membros" on public.titles
  for update to authenticated
  using (exists (select 1 from public.allowed_members where email = lower(auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.allowed_members where email = lower(auth.jwt() ->> 'email')));
create policy "Excluir titulos para membros" on public.titles
  for delete to authenticated
  using (exists (select 1 from public.allowed_members where email = lower(auth.jwt() ->> 'email')));
