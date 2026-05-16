create table if not exists public.user_recents (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  item_type text not null check (item_type in ('file', 'folder')),
  accessed_at timestamptz not null default timezone('utc'::text, now()),
  primary key (user_id, item_id)
);

create index if not exists user_recents_user_accessed_at_idx
  on public.user_recents (user_id, accessed_at desc);

alter table public.user_recents enable row level security;

grant select, insert, update, delete on table public.user_recents to authenticated;
grant select, insert, update, delete on table public.user_recents to service_role;

drop policy if exists "Users can manage their own recents" on public.user_recents;
create policy "Users can manage their own recents"
  on public.user_recents
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.user_recents is
  'Per-user recently accessed notes and folders.';
