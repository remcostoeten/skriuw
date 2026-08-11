ALTER TABLE history_outbox
    ADD COLUMN next_attempt_at INTEGER NOT NULL DEFAULT 0
        CHECK (next_attempt_at >= 0);

DROP INDEX history_outbox_claim;

CREATE INDEX history_outbox_claim
    ON history_outbox(next_attempt_at, claimed_at, created_at, id);
