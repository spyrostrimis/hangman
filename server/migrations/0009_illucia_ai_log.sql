-- Experimental AI mode log (owner's decision 2026-10-04): one row per AI question attempt,
-- for reading after days of live play. No username: rows carry the round id, which links to an
-- account only while the round record exists (about 24 hours); account deletion removes the
-- rows still linked. Kept until the owner deletes them (disclosed on /privacy).
CREATE TABLE illucia_ai_log (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  round_id TEXT NOT NULL,
  -- The round and the board when she asked.
  round_seq INTEGER,
  tier TEXT,
  word TEXT,
  word_length INTEGER,
  turn INTEGER,
  guesses TEXT,
  pattern TEXT,
  missed TEXT,
  misses_left INTEGER,
  candidate_count INTEGER,
  candidates TEXT,
  -- The models and what they did.
  model_key TEXT,
  inventor TEXT,
  sorter TEXT,
  outcome TEXT NOT NULL,
  reason TEXT,
  question TEXT,
  question_problems TEXT,
  invent_ms INTEGER,
  sort_ms INTEGER,
  total_ms INTEGER,
  invent_yes TEXT,
  yes_words TEXT,
  yes_count INTEGER,
  no_count INTEGER,
  yes_share REAL,
  word_side TEXT CHECK (word_side IN ('yes', 'no')),
  probabilities TEXT,
  invent_neurons REAL,
  sort_neurons REAL,
  -- The player's answer, written later by /user/illucia/ai-answer.
  answer TEXT CHECK (answer IN ('yes', 'no', 'declined')),
  answered_at INTEGER
);
CREATE INDEX illucia_ai_log_created ON illucia_ai_log(created_at);
CREATE INDEX illucia_ai_log_round ON illucia_ai_log(round_id);
