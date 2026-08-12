CREATE TABLE note_properties (
    note_id TEXT NOT NULL REFERENCES workspace_nodes(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    value_json TEXT NOT NULL CHECK (json_valid(value_json)),
    options_json TEXT NOT NULL CHECK (json_valid(options_json)),
    position INTEGER NOT NULL CHECK (position >= 0),
    PRIMARY KEY (note_id, id)
) STRICT;

CREATE INDEX note_properties_note ON note_properties(note_id, position, id);

CREATE TABLE note_property_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 0)
) STRICT;

CREATE INDEX note_property_templates_position ON note_property_templates(position, id);

CREATE TABLE note_property_template_fields (
    template_id TEXT NOT NULL REFERENCES note_property_templates(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    value_json TEXT NOT NULL CHECK (json_valid(value_json)),
    options_json TEXT NOT NULL CHECK (json_valid(options_json)),
    position INTEGER NOT NULL CHECK (position >= 0),
    PRIMARY KEY (template_id, id)
) STRICT;

CREATE INDEX note_property_template_fields_template
    ON note_property_template_fields(template_id, position, id);
