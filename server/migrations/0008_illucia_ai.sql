-- Experimental AI mode (v2 Track D2): Illucia may ask a Workers AI model for a meaning
-- question in an experimental round. See server/README.md and docs/SCORING.md.

-- AI questions granted in this round (at most 2), and the token of the latest grant.
ALTER TABLE illucia_rounds ADD COLUMN ai_questions INTEGER NOT NULL DEFAULT 0 CHECK (ai_questions BETWEEN 0 AND 2);
ALTER TABLE illucia_rounds ADD COLUMN ai_token TEXT;

-- AI questions per account per UTC day, for the per-player daily limit. Deleted with
-- the account, and swept by the hourly retention job once the day is two days old.
CREATE TABLE illucia_ai_users (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  questions INTEGER NOT NULL CHECK (questions >= 1),
  PRIMARY KEY (user_id, day)
) WITHOUT ROWID;
CREATE INDEX illucia_ai_users_day ON illucia_ai_users(day);

-- Site-wide Workers AI use per UTC day, with no account. `neurons` holds each request's
-- worst-case reservation until its measured usage replaces it.
CREATE TABLE ai_budget (
  day TEXT PRIMARY KEY,
  requests INTEGER NOT NULL DEFAULT 0 CHECK (requests >= 0),
  neurons REAL NOT NULL DEFAULT 0 CHECK (neurons >= 0)
) WITHOUT ROWID;
