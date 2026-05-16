-- Admin-creatable custom categories for /project-planning.
-- Sections are created/renamed/deleted via the page UI by admins.
-- Items inside a section reuse the priority_level enum.

create table if not exists public.planning_sections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists planning_sections_sort_idx
  on public.planning_sections (sort_order, created_at);

drop trigger if exists planning_sections_set_updated_at on public.planning_sections;
create trigger planning_sections_set_updated_at
  before update on public.planning_sections
  for each row execute function public.set_updated_at();

alter table public.planning_sections enable row level security;
grant select on table public.planning_sections to anon, authenticated;
grant insert, update, delete on table public.planning_sections to authenticated;
grant select, insert, update, delete on table public.planning_sections to service_role;

drop policy if exists "Public can read planning_sections" on public.planning_sections;
create policy "Public can read planning_sections"
  on public.planning_sections for select to anon, authenticated using (true);

drop policy if exists "Admins write planning_sections" on public.planning_sections;
create policy "Admins write planning_sections"
  on public.planning_sections for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create table if not exists public.planning_section_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.planning_sections(id) on delete cascade,
  title text not null,
  content text not null default '',
  priority public.priority_level,
  tags text[] not null default array[]::text[],
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists planning_section_items_section_idx
  on public.planning_section_items (section_id, sort_order, created_at);

drop trigger if exists planning_section_items_set_updated_at on public.planning_section_items;
create trigger planning_section_items_set_updated_at
  before update on public.planning_section_items
  for each row execute function public.set_updated_at();

alter table public.planning_section_items enable row level security;
grant select on table public.planning_section_items to anon, authenticated;
grant insert, update, delete on table public.planning_section_items to authenticated;
grant select, insert, update, delete on table public.planning_section_items to service_role;

drop policy if exists "Public can read planning_section_items" on public.planning_section_items;
create policy "Public can read planning_section_items"
  on public.planning_section_items for select to anon, authenticated using (true);

drop policy if exists "Admins write planning_section_items" on public.planning_section_items;
create policy "Admins write planning_section_items"
  on public.planning_section_items for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

comment on table public.planning_sections is
  'Admin-defined custom categories shown on /project-planning alongside built-in sections.';
comment on table public.planning_section_items is
  'Items within an admin-defined planning section.';
