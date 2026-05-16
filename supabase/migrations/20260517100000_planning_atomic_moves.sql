-- Atomic cross-section moves. SECURITY DEFINER so the function bypasses RLS,
-- but the body explicitly checks admin role before any writes. This replaces
-- the previous two-round-trip pattern (insert + delete) with one transaction.

create or replace function public.move_feature_to_section(
  _feature_id uuid,
  _target text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_title text;
  v_description text;
  v_priority public.priority_level;
begin
  if not public.has_role(v_caller, 'admin') then
    raise exception 'Forbidden: admin role required';
  end if;
  if _target not in ('nice', 'scratch') then
    raise exception 'Invalid target: %', _target;
  end if;

  select title, description, priority
    into v_title, v_description, v_priority
  from public.features where id = _feature_id;
  if not found then
    raise exception 'Feature not found: %', _feature_id;
  end if;

  if _target = 'nice' then
    if exists (
      select 1 from public.issues where feature_id = _feature_id
    ) then
      raise exception 'Cannot move feature % while issues still exist', _feature_id;
    end if;

    insert into public.nice_to_haves (title, description, reason, priority)
    values (v_title, v_description, '', v_priority);
  else
    if exists (
      select 1 from public.issues where feature_id = _feature_id
    ) then
      raise exception 'Cannot move feature % while issues still exist', _feature_id;
    end if;

    insert into public.scratch_entries (title, content, type)
    values (v_title, v_description, 'note');
  end if;

  delete from public.features where id = _feature_id;
end;
$$;

create or replace function public.move_nice_to_section(
  _nice_id uuid,
  _target text,
  _new_slug text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_title text;
  v_description text;
  v_reason text;
  v_priority public.priority_level;
begin
  if not public.has_role(v_caller, 'admin') then
    raise exception 'Forbidden: admin role required';
  end if;
  if _target not in ('roadmap', 'scratch') then
    raise exception 'Invalid target: %', _target;
  end if;
  if _target = 'roadmap' and nullif(btrim(_new_slug), '') is null then
    raise exception 'Slug is required when moving into roadmap';
  end if;

  select title, description, reason, priority
    into v_title, v_description, v_reason, v_priority
  from public.nice_to_haves where id = _nice_id;
  if not found then
    raise exception 'Nice-to-have not found: %', _nice_id;
  end if;

  if _target = 'roadmap' then
    insert into public.features (title, slug, description, status, priority, tags)
    values (v_title, _new_slug, v_description, 'exploring', v_priority, array[]::text[]);
  else
    insert into public.scratch_entries (title, content, type)
    values (
      v_title,
      btrim(concat_ws(E'\n\n', nullif(v_description, ''), nullif(v_reason, ''))),
      'note'
    );
  end if;

  delete from public.nice_to_haves where id = _nice_id;
end;
$$;

create or replace function public.move_scratch_to_section(
  _scratch_id uuid,
  _target text,
  _new_slug text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_title text;
  v_content text;
begin
  if not public.has_role(v_caller, 'admin') then
    raise exception 'Forbidden: admin role required';
  end if;
  if _target not in ('roadmap', 'nice') then
    raise exception 'Invalid target: %', _target;
  end if;
  if _target = 'roadmap' and nullif(btrim(_new_slug), '') is null then
    raise exception 'Slug is required when moving into roadmap';
  end if;

  select title, content into v_title, v_content
  from public.scratch_entries where id = _scratch_id;
  if not found then
    raise exception 'Scratch entry not found: %', _scratch_id;
  end if;

  if _target = 'roadmap' then
    insert into public.features (title, slug, description, status, priority, tags)
    values (v_title, _new_slug, v_content, 'exploring', 'medium', array[]::text[]);
  else
    insert into public.nice_to_haves (title, description, reason, priority)
    values (v_title, v_content, '', 'medium');
  end if;

  delete from public.scratch_entries where id = _scratch_id;
end;
$$;

grant execute on function public.move_feature_to_section(uuid, text) to authenticated;
grant execute on function public.move_nice_to_section(uuid, text, text) to authenticated;
grant execute on function public.move_scratch_to_section(uuid, text, text) to authenticated;
