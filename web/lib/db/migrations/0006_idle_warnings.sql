-- Feature 6: Idle warnings during Red light
-- Adds organiser_alerts table for dashboard tray + dedupe of phone notifications.
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS "organiser_alerts" (
  "id" bigserial PRIMARY KEY,
  "hackathon_id" text NOT NULL REFERENCES "hackathons"("id"),
  "team_id" text NOT NULL REFERENCES "teams"("id"),
  "type" text NOT NULL,
  "message" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "dismissed_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "idx_organiser_alerts_hackathon"
  ON "organiser_alerts" ("hackathon_id", "created_at");

CREATE INDEX IF NOT EXISTS "idx_organiser_alerts_team_type"
  ON "organiser_alerts" ("team_id", "type", "created_at");
