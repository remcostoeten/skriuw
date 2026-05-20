do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'notes'
  ) then
    alter table public.notes
      add column if not exists tags text[] not null default array[]::text[];
  end if;
end
$$;
