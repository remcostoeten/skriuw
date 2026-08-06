ALTER TABLE sync_blocked_operations ADD COLUMN resolution TEXT CHECK (
    (resolution IS NULL OR resolution IN ('retried', 'discarded')) AND
    ((resolution IS NULL) = (resolved_at IS NULL))
);

CREATE INDEX sync_blocked_operations_discarded
    ON sync_blocked_operations(resolved_at DESC)
    WHERE resolution = 'discarded';
