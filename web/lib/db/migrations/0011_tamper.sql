-- Feature 10: Hardened tamper detection.
-- Per-team tamper events posted in batches by the device (Settings page opens,
-- ADB toggles, time drift, safe-mode boot, unexpected package install/removal).
-- resolved_at backs the dashboard "unresolved" badge; null = unresolved.
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS "tamper_events" (
  "id" bigserial PRIMARY KEY,
  "team_id" text NOT NULL REFERENCES "teams"("id"),
  "hackathon_id" text NOT NULL REFERENCES "hackathons"("id"),
  "type" text NOT NULL,
  "detail" jsonb,
  "occurred_at" timestamptz NOT NULL,
  "resolved_at" timestamptz,
  "created_at" timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_tamper_team" ON "tamper_events" ("team_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "idx_tamper_hackathon" ON "tamper_events" ("hackathon_id", "occurred_at");
