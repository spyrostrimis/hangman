-- Bound the per-account lookup used to keep new tickets after the last award.
CREATE INDEX rounds_user_claimed_at ON rounds(user_id, claimed_at DESC);
