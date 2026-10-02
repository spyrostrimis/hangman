-- Illucia (Play vs AI) scoring. The player commits a word at round start; the
-- Worker rules-checks a claimed win against it. See docs/SCORING.md.

-- One row per account that has started an Illucia round. round_seq numbers its
-- rounds; the ladder advances only on the round right after its last step.
CREATE TABLE illucia_players (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  round_seq INTEGER NOT NULL DEFAULT 0 CHECK (round_seq >= 0),
  ladder_rung INTEGER NOT NULL DEFAULT 0 CHECK (ladder_rung BETWEEN 0 AND 2),
  ladder_length INTEGER,
  ladder_seq INTEGER,
  CHECK ((ladder_rung = 0) = (ladder_length IS NULL) AND (ladder_length IS NULL) = (ladder_seq IS NULL))
);

CREATE TABLE illucia_rounds (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  word TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('apprentice', 'scholar', 'master')),
  seed INTEGER NOT NULL CHECK (seed BETWEEN 0 AND 4294967295),
  experimental INTEGER NOT NULL CHECK (experimental IN (0, 1)),
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  claimed_at INTEGER,
  claim_token TEXT,
  -- Award breakdown, written by the claim that consumed the ticket, so retries return it.
  stump_points INTEGER,
  ladder_points INTEGER,
  award_reason TEXT,
  CHECK ((claimed_at IS NULL) = (claim_token IS NULL)),
  CHECK ((claimed_at IS NULL) = (stump_points IS NULL) AND (stump_points IS NULL) = (ladder_points IS NULL))
);
-- Separate from Hangman's rounds: each mode has its own single outstanding ticket.
CREATE UNIQUE INDEX illucia_rounds_active_user ON illucia_rounds(user_id) WHERE claimed_at IS NULL;
CREATE INDEX illucia_rounds_user_claimed_at ON illucia_rounds(user_id, claimed_at DESC);
CREATE INDEX illucia_rounds_claimed_retention ON illucia_rounds(claimed_at) WHERE claimed_at IS NOT NULL;
CREATE INDEX illucia_rounds_unclaimed_retention ON illucia_rounds(expires_at) WHERE claimed_at IS NULL;

-- Words that beat her in normal mode, kept per account until account deletion.
-- points > 0 means the word has paid and can never pay again (any tier).
CREATE TABLE illucia_beaten_words (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  points INTEGER NOT NULL CHECK (points >= 0),
  paid_round_id TEXT,
  beaten_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, word),
  CHECK ((points > 0) = (paid_round_id IS NOT NULL))
) WITHOUT ROWID;
