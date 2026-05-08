create table if not exists public.ai_error_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  endpoint text not null,
  action text,
  model text,
  provider text not null default 'gemini',
  error_source text not null,
  error_code text not null,
  error_message text not null,
  http_status integer,
  provider_status integer,
  provider_message text,
  content_length integer,
  has_user_api_key boolean not null default false,
  api_key_fingerprint text,
  user_agent text,
  request_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_error_events_created_at_idx
  on public.ai_error_events (created_at desc);

create index if not exists ai_error_events_user_id_created_at_idx
  on public.ai_error_events (user_id, created_at desc);

create index if not exists ai_error_events_code_created_at_idx
  on public.ai_error_events (error_code, created_at desc);

alter table public.ai_error_events enable row level security;

grant insert on table public.ai_error_events to authenticated;
grant select, insert, update, delete on table public.ai_error_events to service_role;

create policy "Users can insert their own AI diagnostics"
  on public.ai_error_events
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

comment on table public.ai_error_events is
  'Privacy-preserving AI diagnostic events. Raw provider API keys must never be stored here.';

comment on column public.ai_error_events.api_key_fingerprint is
  'Short one-way SHA-256 prefix used only to correlate repeated key failures without storing raw key material.';
