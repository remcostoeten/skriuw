CREATE TABLE note_share (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  note_id TEXT NOT NULL,
  title TEXT NOT NULL,
  markdown TEXT NOT NULL,
  live INTEGER NOT NULL CHECK (live IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (owner_user_id, note_id)
);
CREATE INDEX note_share_owner_idx ON note_share(owner_user_id);
