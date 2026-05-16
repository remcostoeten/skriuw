-- Seed initial roadmap content so the public page has something to show.
-- Idempotent via on conflict on slug for features; nice/scratch use stable
-- titles and only insert when the table is empty.

insert into public.features (slug, title, description, status, priority, tags)
values
  ('block-editor-v2',
   'Block editor v2',
   'Rebuild the block editor with a tighter selection model, slash commands, and inline transforms.',
   'in_progress', 'high', array['editor','core']),
  ('journal-weekly-view',
   'Journal weekly view',
   'A horizontal seven-day view inside the journal sidebar with quick capture per day.',
   'planned', 'medium', array['journal']),
  ('local-first-sync',
   'Local-first sync',
   'Investigate CRDT-backed sync so notes stay editable offline and converge cleanly.',
   'exploring', 'critical', array['sync','infra']),
  ('export-pdf',
   'Export to PDF',
   'One-click export with page numbers, headers and a clean print stylesheet.',
   'completed', 'low', array['export']),
  ('workspace-permissions',
   'Workspace permissions',
   'Per-folder share roles. Blocked on auth roles model.',
   'blocked', 'high', array['auth','sharing'])
on conflict (slug) do nothing;

with f as (select id, slug from public.features)
insert into public.issues (feature_id, title, description, status, priority, assignee, tags)
select f.id, t.title, t.description, t.status::public.issue_status,
       t.priority::public.priority_level, t.assignee, t.tags
from f
join (values
  ('block-editor-v2', 'Slash menu keyboard navigation',
   'Arrow keys and enter should fully drive the slash menu.',
   'in_progress', 'high', 'Mara', array['a11y','input']),
  ('block-editor-v2', 'Drag handle alignment on code blocks',
   'Handle drifts 4px when a code block has a caption.',
   'todo', 'medium', null::text, array['bug','ui']),
  ('journal-weekly-view', 'Design weekly strip',
   'Pick density, hover and active states matching the calendar.',
   'todo', 'medium', null::text, array['design'])
) as t(slug, title, description, status, priority, assignee, tags)
  on f.slug = t.slug
where not exists (
  select 1 from public.issues i where i.feature_id = f.id and i.title = t.title
);

insert into public.nice_to_haves (title, description, reason, priority)
select * from (values
  ('Hand-drawn diagram block',
   'Embeddable freeform sketch block, exports as SVG.',
   'Useful but rarely requested. Wait until editor v2 lands.',
   'low'::public.priority_level),
  ('Public note share links',
   'Read-only public URLs with optional password.',
   'Depends on workspace permissions shipping first.',
   'medium'::public.priority_level)
) as v(title, description, reason, priority)
where not exists (select 1 from public.nice_to_haves);

insert into public.scratch_entries (title, content, type)
select * from (values
  ('Selection model question',
   'Should we keep ProseMirror''s selection or build a thin wrapper around DOM Range? Pros and cons in notebook.',
   'question'::public.scratch_type),
  ('Sync provider decision',
   'Picking Yjs for the first pass. Revisit Automerge if perf is rough at 50k blocks.',
   'decision'::public.scratch_type),
  ('Slash command prompt draft',
   'Given a paragraph, suggest the next 3 likely block types. Tune to journal voice not enterprise.',
   'prompt'::public.scratch_type),
  ('Quick capture idea',
   'Cmd+Shift+N opens a floating capture window above any window. Worth testing.',
   'idea'::public.scratch_type)
) as v(title, content, type)
where not exists (select 1 from public.scratch_entries);
