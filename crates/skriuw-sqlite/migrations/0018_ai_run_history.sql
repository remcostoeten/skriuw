CREATE TABLE ai_run_history (
    run_id TEXT PRIMARY KEY,
    started_at_ms INTEGER NOT NULL,
    origin TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    system_prompt TEXT,
    user_prompt TEXT,
    state TEXT NOT NULL,
    error_category TEXT,
    duration_ms INTEGER NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    token_source TEXT NOT NULL,
    cost_micros INTEGER
);

CREATE INDEX ai_run_history_started_at ON ai_run_history (started_at_ms DESC);
CREATE INDEX ai_run_history_provider_model ON ai_run_history (provider_id, model_id);

CREATE TABLE ai_history_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    retain_prompts INTEGER NOT NULL,
    max_runs INTEGER NOT NULL,
    max_age_days INTEGER NOT NULL
);

INSERT INTO ai_history_settings (id, retain_prompts, max_runs, max_age_days)
VALUES (1, 1, 500, 90);
