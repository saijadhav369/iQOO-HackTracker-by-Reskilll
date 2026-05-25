-- Feature 1: Red/Green Light (venue signal)
-- Adds current_light + light_changed_at to hackathons and creates light_transitions table.
-- Idempotent: safe to run multiple times.

ALTER TABLE "hackathons"
  ADD COLUMN IF NOT EXISTS "current_light" text NOT NULL DEFAULT 'green';

ALTER TABLE "hackathons"
  ADD COLUMN IF NOT EXISTS "light_changed_at" timestamptz;

CREATE TABLE IF NOT EXISTS "light_transitions" (
  "id" bigserial PRIMARY KEY,
  "hackathon_id" text NOT NULL REFERENCES "hackathons"("id"),
  "light" text NOT NULL,
  "changed_at" timestamptz NOT NULL,
  "changed_by" text
);

CREATE INDEX IF NOT EXISTS "idx_light_transitions_hackathon"
  ON "light_transitions" ("hackathon_id", "changed_at");