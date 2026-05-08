create table if not exists public.ai_provider_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'gemini',
  label text not null,
  encrypted_key text not null,
  key_preview text not null,
  key_fingerprint text not null,
  status text not null default 'untested'
    check (status in ('untested', 'valid', 'invalid', 'rate_limited', 'error')),
  last_tested_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, key_fingerprint)
);

create index if not exists ai_provider_keys_user_provider_idx
  on public.ai_provider_keys (user_id, provider, created_at desc);

alter table public.ai_provider_keys enable row level security;

grant select, insert, update, delete on table public.ai_provider_keys to service_role;

comment on table public.ai_provider_keys is
  'Encrypted user-owned AI provider keys. Raw keys must never be returned to clients.';

comment on column public.ai_provider_keys.encrypted_key is
  'Application-level AES-GCM ciphertext encrypted with AI_KEYS_ENCRYPTION_SECRET.';

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  provider text not null,
  model text,
  action text not null,
  human_action text,
  resource_type text,
  resource_id text,
  resource_url text,
  prompt text,
  status text not null check (status in ('success', 'error')),
  error_message text,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  estimated_cost numeric(14, 8),
  estimated_cost_currency text,
  estimated_cost_eur numeric(14, 8),
  key_source text not null default 'unknown'
    check (key_source in ('free_quota', 'user_key', 'owner_key', 'payment_backed', 'unknown')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_logs_user_created_at_idx
  on public.ai_usage_logs (user_id, created_at desc);

create index if not exists ai_usage_logs_action_created_at_idx
  on public.ai_usage_logs (action, created_at desc);

alter table public.ai_usage_logs enable row level security;

grant select on table public.ai_usage_logs to authenticated;
grant select, insert, update, delete on table public.ai_usage_logs to service_role;

create policy "Users can view their own AI usage"
  on public.ai_usage_logs
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.ai_usage_logs is
  'Per-user AI usage log. Prompts may contain user content and are visible only to the owning user plus service role.';
