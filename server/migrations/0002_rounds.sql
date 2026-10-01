CREATE TABLE rounds (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  claimed_at INTEGER,
  claim_token TEXT,
  CHECK ((claimed_at IS NULL) = (claim_token IS NULL))
);
-- Concurrent starts resume the same outstanding round, rather than minting tickets in bulk.
CREATE UNIQUE INDEX rounds_active_user ON rounds(user_id) WHERE claimed_at IS NULL;
CREATE INDEX rounds_expiry ON rounds(expires_at);
