CREATE TABLE sync_workspace (
  id TEXT PRIMARY KEY NOT NULL,
  owner_user_id TEXT NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE sync_membership (
  workspace_id TEXT NOT NULL REFERENCES sync_workspace(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX sync_membership_user_idx ON sync_membership(user_id);

CREATE TABLE sync_device (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, device_id),
  FOREIGN KEY (workspace_id, user_id)
    REFERENCES sync_membership(workspace_id, user_id) ON DELETE CASCADE
);
CREATE INDEX sync_device_user_idx ON sync_device(user_id);
