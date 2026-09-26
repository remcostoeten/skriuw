WITH ranked_active_entries AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY user_id, date_key
            ORDER BY updated_at DESC, created_at DESC, id DESC
        ) AS active_rank
    FROM journal_entries
    WHERE deleted_at IS NULL
)
UPDATE journal_entries
SET
    deleted_at = NOW(),
    updated_at = NOW()
WHERE id IN (
    SELECT id
    FROM ranked_active_entries
    WHERE active_rank > 1
);

CREATE UNIQUE INDEX journal_entries_user_id_date_key_active_unique
    ON journal_entries(user_id, date_key)
    WHERE deleted_at IS NULL;
