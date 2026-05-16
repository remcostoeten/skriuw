-- Project Planning module: public-readable roadmap with admin-only editing.
-- Tables: features, issues, nice_to_haves, scratch_entries, user_roles.
-- Roles use a SECURITY DEFINER has_role() function to avoid RLS recursion.

-- Enums

do $$ begin
  create type public.app_role as enum ('admin', 'moderator', 'user');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.feature_status as enum (
    'exploring', 'planned', 'in_progress', 'blocked', 'completed', 'archived'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.priority_level as enum ('low', 'medium', 'high', 'critical');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.issue_status as enum ('todo', 'in_progress', 'blocked', 'done');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.scratch_type as enum ('prompt', 'note', 'idea', 'decision', 'question');
exception when duplicate_object then null; end $$;

-- user_roles table

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create index if not exists user_roles_user_id_idx on public.user_roles (user_id);

alter table public.user_roles enable row level security;

grant select on table public.user_roles to authenticated, anon;
grant select, insert, update, delete on table public.user_roles to service_role;

-- has_role function: SECURITY DEFINER so RLS policies don't recurse on user_roles.

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

grant execute on function public.has_role(uuid, public.app_role) to anon, authenticated;

-- user_roles policies (after has_role exists)

drop policy if exists "Users read own roles" on public.user_roles;
create policy "Users read own roles"
  on public.user_roles for select
  to authenticated
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins manage roles" on public.user_roles;
create policy "Admins manage roles"
  on public.user_roles for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Shared updated_at trigger

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- features

create table if not exists public.features (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text not null default '',
  status public.feature_status not null default 'exploring',
  priority public.priority_level not null default 'medium',
  tags text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists features_status_idx on public.features (status);
create index if not exists features_updated_at_idx on public.features (updated_at desc);

drop trigger if exists features_set_updated_at on public.features;
create trigger features_set_updated_at
  before update on public.features
  for each row execute function public.set_updated_at();

alter table public.features enable row level security;

grant select on table public.features to anon, authenticated;
grant select, insert, update, delete on table public.features to service_role;
grant insert, update, delete on table public.features to authenticated;

drop policy if exists "Public can read features" on public.features;
create policy "Public can read features"
  on public.features for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins write features" on public.features;
create policy "Admins write features"
  on public.features for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- issues

create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  feature_id uuid not null references public.features(id) on delete cascade,
  title text not null,
  description text not null default '',
  status public.issue_status not null default 'todo',
  priority public.priority_level not null default 'medium',
  assignee text,
  tags text[] not null default array[]::text[],
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists issues_feature_id_idx on public.issues (feature_id);
create index if not exists issues_status_idx on public.issues (status);

drop trigger if exists issues_set_updated_at on public.issues;
create trigger issues_set_updated_at
  before update on public.issues
  for each row execute function public.set_updated_at();

alter table public.issues enable row level security;

grant select on table public.issues to anon, authenticated;
grant select, insert, update, delete on table public.issues to service_role;
grant insert, update, delete on table public.issues to authenticated;

drop policy if exists "Public can read issues" on public.issues;
create policy "Public can read issues"
  on public.issues for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins write issues" on public.issues;
create policy "Admins write issues"
  on public.issues for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- nice_to_haves

create table if not exists public.nice_to_haves (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  reason text not null default '',
  priority public.priority_level not null default 'medium',
  created_at timestamptz not null default now()
);

create index if not exists nice_to_haves_created_at_idx on public.nice_to_haves (created_at desc);

alter table public.nice_to_haves enable row level security;

grant select on table public.nice_to_haves to anon, authenticated;
grant select, insert, update, delete on table public.nice_to_haves to service_role;
grant insert, update, delete on table public.nice_to_haves to authenticated;

drop policy if exists "Public can read nice_to_haves" on public.nice_to_haves;
create policy "Public can read nice_to_haves"
  on public.nice_to_haves for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins write nice_to_haves" on public.nice_to_haves;
create policy "Admins write nice_to_haves"
  on public.nice_to_haves for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- scratch_entries

create table if not exists public.scratch_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null default '',
  type public.scratch_type not null default 'note',
  created_at timestamptz not null default now()
);

create index if not exists scratch_entries_created_at_idx on public.scratch_entries (created_at desc);

alter table public.scratch_entries enable row level security;

grant select on table public.scratch_entries to anon, authenticated;
grant select, insert, update, delete on table public.scratch_entries to service_role;
grant insert, update, delete on table public.scratch_entries to authenticated;

drop policy if exists "Public can read scratch_entries" on public.scratch_entries;
create policy "Public can read scratch_entries"
  on public.scratch_entries for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins write scratch_entries" on public.scratch_entries;
create policy "Admins write scratch_entries"
  on public.scratch_entries for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

comment on table public.features is 'Public project planning topics (admin-editable).';
comment on table public.issues is 'Tickets under a feature/topic (admin-editable).';
comment on table public.nice_to_haves is 'Parked ideas, lower priority (admin-editable).';
comment on table public.scratch_entries is 'Notes, prompts, decisions (admin-editable).';
comment on function public.has_role(uuid, public.app_role) is
  'SECURITY DEFINER role check used by RLS policies to avoid recursion on user_roles.';
