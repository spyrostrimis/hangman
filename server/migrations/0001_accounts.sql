CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  salt TEXT NOT NULL CHECK (length(salt) = 32),
  verifier TEXT NOT NULL CHECK (length(verifier) = 64),
  kdf_version INTEGER NOT NULL DEFAULT 1 CHECK (kdf_version = 1),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE scores (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0 AND total <= 9007199254740900),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX scores_ranking ON scores(total DESC, user_id ASC);
