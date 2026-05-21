create table if not exists public.note_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id text not null,
  name text not null,
  content text not null,
  rich_content jsonb,
  preferred_editor_mode text not null default 'block'
    check (preferred_editor_mode in ('raw', 'block')),
  parent_id text,
  tags text[] not null default array[]::text[],
  reason text not null
    check (reason in ('created', 'autosave', 'rename', 'restore')),
  content_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.note_versions
  add constraint note_versions_user_note_fk
  foreign key (user_id, note_id)
  references public.notes (user_id, id)
  on delete cascade;

alter table public.note_versions
  add constraint note_versions_user_folder_fk
  foreign key (user_id, parent_id)
  references public.folders (user_id, id)
  on delete set null;

create index if not exists note_versions_user_note_created_at_idx
  on public.note_versions (user_id, note_id, created_at desc);

create index if not exists note_versions_user_created_at_idx
  on public.note_versions (user_id, created_at desc);

alter table public.note_versions enable row level security;

grant select, insert, update, delete on table public.note_versions to authenticated;
grant select, insert, update, delete on table public.note_versions to service_role;

drop policy if exists "Users can manage their own note versions" on public.note_versions;
create policy "Users can manage their own note versions"
  on public.note_versions
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.note_versions is
  'Sparse per-note checkpoints for the note history sidebar.';
