-- Feature: multi-phone teams + per-device telemetry partitioning.
-- Schema commit 8aaa14b added team_members + nullable device_id to six
-- telemetry tables but no SQL was committed. This catches prod up.
-- Fully idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS "team_members" (
  "id" bigserial PRIMARY KEY,
  "team_id" text NOT NULL REFERENCES "teams"("id"),
  "hackathon_id" text NOT NULL REFERENCES "hackathons"("id"),
  "device_id" text NOT NULL,
  "slot" integer NOT NULL,
  "member_name" text NOT NULL,
  "registered_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_team_members_team_slot"
  ON "team_members" ("team_id", "slot");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_team_members_team_device"
  ON "team_members" ("team_id", "device_id");
CREATE INDEX IF NOT EXISTS "idx_team_members_team"
  ON "team_members" ("team_id");

ALTER TABLE "app_usage"        ADD COLUMN IF NOT EXISTS "device_id" text;
ALTER TABLE "camera_events"    ADD COLUMN IF NOT EXISTS "device_id" text;
ALTER TABLE "clipboard_events" ADD COLUMN IF NOT EXISTS "device_id" text;
ALTER TABLE "device_vitals"    ADD COLUMN IF NOT EXISTS "device_id" text;
ALTER TABLE "tamper_events"    ADD COLUMN IF NOT EXISTS "device_id" text;
ALTER TABLE "crash_logs"       ADD COLUMN IF NOT EXISTS "device_id" text;

-- Partition-aware indexes for the leaderboard's per-(team, device) reads.
-- 300-user scale will hammer these; the indexes are cheap to add now while
-- the tables are small. Drop+recreate without IF NOT EXISTS is fine on a
-- fresh column since the (team_id, device_id) tuple is new.
CREATE INDEX IF NOT EXISTS "idx_device_vitals_team_device"
  ON "device_vitals" ("team_id", "device_id", "recorded_at");
CREATE INDEX IF NOT EXISTS "idx_app_usage_team_device"
  ON "app_usage" ("team_id", "device_id", "snapshot_time");
