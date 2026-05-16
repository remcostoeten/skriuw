-- Replace placeholder project-planning seed content with real Skriuw work.
-- Closed items are derived from merged PR commits in git history.

delete from public.features
where slug in (
  'block-editor-v2',
  'journal-weekly-view',
  'local-first-sync',
  'export-pdf',
  'workspace-permissions'
);

delete from public.nice_to_haves
where title in (
  'Hand-drawn diagram block',
  'Public note share links'
);

delete from public.scratch_entries
where title in (
  'Selection model question',
  'Sync provider decision',
  'Slash command prompt draft',
  'Quick capture idea'
);

delete from public.planning_sections
where slug = 'closed-from-merged-prs';

insert into public.features (slug, title, description, status, priority, tags)
values
  (
    'ai-provider-platform',
    'AI provider platform',
    'Bring-your-own-key AI actions with provider routing, diagnostics, encrypted key storage, and usage visibility.',
    'completed',
    'critical',
    array['ai', 'settings', 'supabase']
  ),
  (
    'settings-account-data',
    'Settings, account, and data controls',
    'Move account/profile surfaces into the full settings flow, including auth preferences, account deletion, and data export.',
    'in_progress',
    'high',
    array['settings', 'auth', 'export']
  ),
  (
    'editor-note-intelligence',
    'Editor and note intelligence',
    'Block editor polish, MDX/raw mode constraints, inline note links, tags, fonts, line height, and AI editor actions.',
    'in_progress',
    'critical',
    array['editor', 'notes', 'mdx']
  ),
  (
    'architecture-persistence',
    'Architecture and persistence foundation',
    'Flatten the old core layering, migrate persistence for v2, and keep workspace state isolated across web and mobile.',
    'completed',
    'high',
    array['architecture', 'persistence', 'workspace']
  ),
  (
    'notes-journal-layout',
    'Notes, journal, and app shell',
    'Sidebar animation, recents, journal shell, server prefetch, route loading skeletons, and navigation cleanup.',
    'completed',
    'medium',
    array['notes', 'journal', 'layout']
  ),
  (
    'project-planning-roadmap',
    'Project planning roadmap',
    'Make /project-planning useful with real roadmap items, admin editing, atomic moves, and closed work based on merged PRs.',
    'in_progress',
    'high',
    array['planning', 'roadmap', 'admin']
  )
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  status = excluded.status,
  priority = excluded.priority,
  tags = excluded.tags,
  updated_at = now();

delete from public.issues
using public.features
where public.issues.feature_id = public.features.id
  and public.features.slug in (
    'ai-provider-platform',
    'settings-account-data',
    'editor-note-intelligence',
    'architecture-persistence',
    'notes-journal-layout',
    'project-planning-roadmap'
  );

with f as (
  select id, slug from public.features
  where slug in (
    'ai-provider-platform',
    'settings-account-data',
    'editor-note-intelligence',
    'architecture-persistence',
    'notes-journal-layout',
    'project-planning-roadmap'
  )
)
insert into public.issues (
  feature_id,
  title,
  description,
  status,
  priority,
  assignee,
  tags,
  notes
)
select
  f.id,
  t.title,
  t.description,
  t.status::public.issue_status,
  t.priority::public.priority_level,
  t.assignee,
  t.tags,
  t.notes
from f
join (values
  (
    'ai-provider-platform',
    'PR #109: Gemini BYOK, multi-key fallback, and settings UI',
    'Merged Gemini bring-your-own-key flow with encrypted saved keys, inline fallback prompts, and settings configuration.',
    'done',
    'critical',
    null::text,
    array['closed', 'pr-109', 'ai'],
    'Merged commit 43f0158f: feat(ai): Gemini BYOK — multi-key, rate-limit fallback, settings UI (#109)'
  ),
  (
    'ai-provider-platform',
    'PR #111: Groq multi-provider routing and DB migration',
    'Merged provider-agnostic AI SDK routing, Groq models, provider safety, and the gemini-to-google migration.',
    'done',
    'critical',
    null::text,
    array['closed', 'pr-111', 'ai', 'groq'],
    'Merged commit 0d2c840f: feat(ai): Groq multi-provider — unified AI SDK, model routing, DB migration (#111)'
  ),
  (
    'ai-provider-platform',
    'Move AI key management out of Profile and into Settings',
    'Profile page is removed; keep saved key CRUD, usage logs, and provider test UX reachable from Settings -> AI.',
    'in_progress',
    'high',
    null::text,
    array['settings', 'migration'],
    'Current branch work: /api/profile/ai moved to /api/ai and Settings owns key management.'
  ),
  (
    'settings-account-data',
    'Replace modal settings with full settings page',
    'Ship full settings route, account controls, profile cleanup, auth preferences, and export entry points.',
    'done',
    'high',
    null::text,
    array['closed', 'settings'],
    'Committed in d47aa3d7/ffadd3ee settings work.'
  ),
  (
    'settings-account-data',
    'Keep account deletion and data export explicit',
    'Account deletion must fail clearly when admin config is missing; data export should preserve notes, folders, journal entries, and tags.',
    'done',
    'high',
    null::text,
    array['closed', 'auth', 'export'],
    'Follow-up review feedback landed in 1d8b4aca.'
  ),
  (
    'editor-note-intelligence',
    'PR #107: note links and tags as inline chips',
    'Merged interactive inline rendering for note links and tags so references are visible in-editor instead of plain text only.',
    'done',
    'high',
    null::text,
    array['closed', 'pr-107', 'editor'],
    'Merged commit 761038ff: feat(editor): render note links and tags as inline chips (#107)'
  ),
  (
    'editor-note-intelligence',
    'Block specs, MDX mode, font, and line-height polish',
    'Finish editor surface changes around custom block behavior, MDX/raw toggles, typography preferences, and rich text expansion.',
    'in_progress',
    'critical',
    null::text,
    array['editor', 'mdx'],
    'Current branch commit 4d22810b tracks this as active work.'
  ),
  (
    'editor-note-intelligence',
    'Disable Raw segment when editor mode cannot toggle',
    'Prevent raw/MDX controls from looking interactive when the current document cannot switch editor mode.',
    'done',
    'medium',
    null::text,
    array['closed', 'bug', 'mdx'],
    'Fixed in c0cd5f39.'
  ),
  (
    'architecture-persistence',
    'PR #108: Scenario B layer move',
    'Collapse core into domain and shared boundaries so server/client imports are easier to reason about.',
    'done',
    'high',
    null::text,
    array['closed', 'pr-108', 'architecture'],
    'Merged commit 242e2697: refactor(arch): Scenario B layer move — collapse core into domain + shared (#108)'
  ),
  (
    'architecture-persistence',
    'PR #104: migrate persistence for v2',
    'Move the persistence model to the v2 shape and preserve workspace state behavior during auth transitions.',
    'done',
    'high',
    null::text,
    array['closed', 'pr-104', 'persistence'],
    'Merged commit 0d04f2fa: Migrate persistence for v2 (#104)'
  ),
  (
    'notes-journal-layout',
    'Sidebar animations, recents, prefetch, and loading skeletons',
    'Ship the notes/journal/layout pass covering sidebar motion, recents, server prefetch, and app loading states.',
    'done',
    'medium',
    null::text,
    array['closed', 'layout', 'journal'],
    'Committed in 14f87e1d/0db68403 notes+journal+layout work.'
  ),
  (
    'notes-journal-layout',
    'Infra housekeeping for fonts, env, legal, 404, and proxy',
    'Keep project shell deployable by cleaning env behavior, legal routes, font wiring, and proxy/auth handling.',
    'done',
    'medium',
    null::text,
    array['closed', 'infra'],
    'Committed in 958b1d90/9c490da9 infra housekeeping.'
  ),
  (
    'project-planning-roadmap',
    'Replace fake roadmap seed with real Skriuw backlog',
    'Remove generic seed items and populate the planning board with current features and merged PR history.',
    'done',
    'high',
    null::text,
    array['closed', 'planning', 'seed'],
    'Implemented by this migration.'
  ),
  (
    'project-planning-roadmap',
    'Keep admin-only mutations and public read access aligned',
    'Planning tables should stay public-readable while insert/update/delete remains limited to admins through RLS.',
    'done',
    'high',
    null::text,
    array['closed', 'rls', 'admin'],
    'Covered by the initial project planning RLS migration and set-admin helper.'
  ),
  (
    'project-planning-roadmap',
    'Add durable ordering for roadmap and custom sections',
    'Roadmap, nice-to-have, scratchpad, and custom section moves need predictable ordering after edits.',
    'todo',
    'medium',
    null::text,
    array['planning', 'ux'],
    'Current tables have created_at/sort_order in some sections, but built-in roadmap ordering still needs a dedicated pass.'
  )
) as t(
  slug,
  title,
  description,
  status,
  priority,
  assignee,
  tags,
  notes
) on f.slug = t.slug;

insert into public.nice_to_haves (title, description, reason, priority)
select * from (values
  (
    'GitHub issue sync',
    'Import open GitHub issues and PR metadata directly into /project-planning.',
    'Useful once the manual roadmap shape proves itself; avoid over-automating before the model settles.',
    'medium'::public.priority_level
  ),
  (
    'Closed-work filters',
    'Add filters for completed issues by PR number, feature, or date.',
    'The closed section is useful now, but filters can wait until it grows.',
    'low'::public.priority_level
  ),
  (
    'Release-baseline view',
    'Show what changed since the latest release tag and link each item back to release notes.',
    'Would help with release summaries but needs a clean tag/release source first.',
    'medium'::public.priority_level
  )
) as v(title, description, reason, priority)
where not exists (
  select 1 from public.nice_to_haves n where n.title = v.title
);

insert into public.scratch_entries (title, content, type)
select * from (values
  (
    'Planning source of truth',
    'Manual seed should reflect real merged work first. Later, GitHub import can hydrate closed items automatically from PRs.',
    'decision'::public.scratch_type
  ),
  (
    'Issue wording rule',
    'Use commit or PR language in closed items so the board stays auditable instead of turning into generic product copy.',
    'note'::public.scratch_type
  ),
  (
    'Next planning slice',
    'Durable ordering and GitHub import are the next obvious PM improvements after replacing the placeholder seed.',
    'idea'::public.scratch_type
  )
) as v(title, content, type)
where not exists (
  select 1 from public.scratch_entries s where s.title = v.title
);

insert into public.planning_sections (slug, title, description, sort_order)
values (
  'closed-from-merged-prs',
  'Closed from merged PRs',
  'Completed work pulled from merged PR commits in this repository.',
  90
);

with section as (
  select id from public.planning_sections where slug = 'closed-from-merged-prs'
)
insert into public.planning_section_items (
  section_id,
  title,
  content,
  priority,
  tags,
  sort_order
)
select
  section.id,
  t.title,
  t.content,
  t.priority::public.priority_level,
  t.tags,
  t.sort_order
from section
cross join (values
  (
    '#111 Groq multi-provider',
    'Merged 0d2c840f. Unified AI SDK routing, Groq models, provider/model safety, and database provider migration.',
    'critical',
    array['ai', 'groq', 'merged-pr'],
    10
  ),
  (
    '#109 Gemini BYOK',
    'Merged 43f0158f. Multi-key Gemini BYOK, rate-limit fallback, AI settings UI, and connection testing.',
    'critical',
    array['ai', 'gemini', 'merged-pr'],
    20
  ),
  (
    '#108 Scenario B architecture move',
    'Merged 242e2697. Collapsed the old core layer into domain/shared boundaries.',
    'high',
    array['architecture', 'merged-pr'],
    30
  ),
  (
    '#107 Inline note links and tags',
    'Merged 761038ff. Render note links and tags as editor inline chips.',
    'high',
    array['editor', 'tags', 'merged-pr'],
    40
  ),
  (
    '#104 Persistence v2',
    'Merged 0d04f2fa. Migrated persistence and workspace state for the v2 app shape.',
    'high',
    array['persistence', 'workspace', 'merged-pr'],
    50
  ),
  (
    '#97 Safe-delete workflow',
    'Merged 0caa96c8. Cleaned stale artifacts and added safer deletion workflow guardrails.',
    'medium',
    array['workflow', 'cleanup', 'merged-pr'],
    60
  ),
  (
    '#89 Global command palette',
    'Merged 77ec560e. Added global command palette with advanced search.',
    'medium',
    array['search', 'command-palette', 'merged-pr'],
    70
  ),
  (
    '#87 User asset storage library',
    'Merged 8cef2e09. Added user asset storage support.',
    'medium',
    array['assets', 'storage', 'merged-pr'],
    80
  )
) as t(title, content, priority, tags, sort_order);
