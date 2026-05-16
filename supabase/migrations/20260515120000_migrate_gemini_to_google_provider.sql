-- Migrate AI provider from 'gemini' to 'google' to align with AI SDK provider naming
-- and prepare for multi-provider support (google, groq, etc.)

-- Update existing rows that use the old 'gemini' provider value
update public.ai_provider_keys set provider = 'google' where provider = 'gemini';
update public.ai_usage_logs set provider = 'google' where provider = 'gemini';
update public.ai_error_events set provider = 'google' where provider = 'gemini';

-- Update the default values
alter table public.ai_provider_keys alter column provider set default 'google';
alter table public.ai_error_events alter column provider set default 'google';