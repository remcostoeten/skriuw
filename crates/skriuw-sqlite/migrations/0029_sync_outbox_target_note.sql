ALTER TABLE sync_outbox ADD COLUMN target_note_id TEXT GENERATED ALWAYS AS (
    CASE json_extract(operation_json, '$.operation.type')
        WHEN 'save_document' THEN json_extract(operation_json, '$.operation.noteId')
        WHEN 'save_sealed_document' THEN json_extract(operation_json, '$.operation.noteId')
        WHEN 'create_note' THEN json_extract(operation_json, '$.operation.id')
    END
) VIRTUAL;

CREATE INDEX sync_outbox_target_note
    ON sync_outbox(target_note_id)
    WHERE target_note_id IS NOT NULL;
