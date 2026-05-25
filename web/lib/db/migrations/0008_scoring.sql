-- Feature 8: Composite build-score leaderboard
-- Per-hackathon JSON overrides for scoring weights + Office Kit package list.
-- Idempotent: safe to run multiple times.

ALTER TABLE "hackathons"
  ADD COLUMN IF NOT EXISTS "scoring_config" jsonb;
