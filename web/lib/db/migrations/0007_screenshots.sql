-- Feature 7: On-demand screen capture
-- Stores organiser screenshot requests + the captured image URL.
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS "screenshot_requests" (
  "id" bigserial PRIMARY KEY,
  "team_id" text NOT NULL REFERENCES "teams"("id"),
  "hackathon_id" text NOT NULL REFERENCES "hackathons"("id"),
  "requested_at" timestamptz NOT NULL DEFAULT now(),
  "captured_at" timestamptz,
  "image_url" text,
  "status" text NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS "idx_screenshot_requests_team"
  ON "screenshot_requests" ("team_id", "requested_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_screenshot_requests_team_status"
  ON "screenshot_requests" ("team_id", "status", "requested_at");
