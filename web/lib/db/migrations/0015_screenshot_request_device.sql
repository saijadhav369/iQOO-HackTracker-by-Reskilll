-- Feature: per-device screenshot requests.
-- Pre-multi-phone, every screenshot request was team-scoped and the first
-- phone to heartbeat grabbed it. With multiple phones per team this races
-- and the wrong member's screen gets captured. The new device_id column
-- pins a request to a specific phone; the heartbeat route filters by it so
-- only the target device picks up the work.
-- Nullable for backward compat: old un-targeted requests (device_id IS NULL)
-- can still be picked up by any phone in the team.
-- Idempotent: safe to run multiple times.

ALTER TABLE "screenshot_requests"
  ADD COLUMN IF NOT EXISTS "device_id" text;

CREATE INDEX IF NOT EXISTS "idx_screenshot_requests_device_pending"
  ON "screenshot_requests" ("team_id", "device_id", "status", "requested_at");
