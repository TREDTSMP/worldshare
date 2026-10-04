-- Run this once in Supabase -> SQL Editor.

-- 1) File list (metadata). The files themselves live in the private "worlds" storage bucket.
create table if not exists public.worlds (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  uploaded_by   text not null,
  filename      text not null,
  storage_path  text not null unique,
  size          bigint not null,
  edition       text not null default 'Unknown',
  version       text not null default 'Unknown',
  world_name    text,
  last_played   timestamptz,
  file_modified timestamptz,
  uploaded_at   timestamptz not null default now()
);

alter table public.worlds enable row level security;

-- Any logged-in account can see the list. Nobody who is logged out can.
create policy "worlds: logged-in can read"   on public.worlds for select to authenticated using (true);
create policy "worlds: add own rows"         on public.worlds for insert to authenticated with check (owner = auth.uid());
create policy "worlds: delete own rows"      on public.worlds for delete to authenticated using (owner = auth.uid());

-- 2) Private storage bucket (50 MB = free-plan maximum per file; raise on a paid plan).
insert into storage.buckets (id, name, public, file_size_limit)
values ('worlds', 'worlds', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- Files are stored as  <user-id>/<random>-<filename>
create policy "worlds files: logged-in can download" on storage.objects for select to authenticated
  using (bucket_id = 'worlds');
create policy "worlds files: upload into own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'worlds' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "worlds files: delete from own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'worlds' and (storage.foldername(name))[1] = auth.uid()::text);
