CREATE INDEX rounds_claimed_retention ON rounds(claimed_at) WHERE claimed_at IS NOT NULL;
CREATE INDEX rounds_unclaimed_retention ON rounds(expires_at) WHERE claimed_at IS NULL;
