-- No username, credential or game history is retained here.
CREATE TABLE deleted_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  deleted_at INTEGER NOT NULL
);
CREATE INDEX deleted_accounts_expiry ON deleted_accounts(deleted_at);
