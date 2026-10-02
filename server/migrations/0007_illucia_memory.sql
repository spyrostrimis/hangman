-- Illucia memory (C2). Only normal-mode rounds are counted, once, when their
-- ticket is created; see docs/SCORING.md.

-- Whether this ticket was counted into the player's history. Tickets from before
-- this migration and experimental tickets were not.
ALTER TABLE illucia_rounds ADD COLUMN counted INTEGER NOT NULL DEFAULT 0 CHECK (counted IN (0, 1));

-- A stable per-account seed for her temperament against this player.
ALTER TABLE illucia_players ADD COLUMN personality_seed INTEGER CHECK (personality_seed BETWEEN 0 AND 4294967295);
UPDATE illucia_players SET personality_seed = abs(random()) % 4294967296 WHERE personality_seed IS NULL;

-- Words this player has set against her, kept until account deletion.
CREATE TABLE illucia_player_words (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  plays INTEGER NOT NULL CHECK (plays >= 1),
  PRIMARY KEY (user_id, word)
) WITHOUT ROWID;

-- Games and wins per tier, kept until account deletion. A win is only counted
-- for a counted ticket, so wins never exceed games.
CREATE TABLE illucia_tier_stats (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('apprentice', 'scholar', 'master')),
  games INTEGER NOT NULL CHECK (games >= 1),
  wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0 AND wins <= games),
  PRIMARY KEY (user_id, tier)
) WITHOUT ROWID;

-- Global plays per word: no account, no time, and not deleted with an account.
-- Never list it publicly; see server/README.md.
CREATE TABLE word_counts (
  word TEXT PRIMARY KEY,
  count INTEGER NOT NULL CHECK (count >= 1)
) WITHOUT ROWID;
