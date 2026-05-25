-- Feature 8b: Hardware-stress leaderboard metrics
-- New per-heartbeat telemetry (thermal + iQOO performance mode) on device_vitals,
-- and per-batch Office Kit dwell time on event_batches.
-- All nullable / defaulted so pre-existing APKs keep posting unchanged.
-- Idempotent: safe to run multiple times.

ALTER TABLE "device_vitals" ADD COLUMN IF NOT EXISTS "thermal_headroom" real;
ALTER TABLE "device_vitals" ADD COLUMN IF NOT EXISTS "thermal_status" integer;
ALTER TABLE "device_vitals" ADD COLUMN IF NOT EXISTS "monster_mode" boolean;

ALTER TABLE "event_batches" ADD COLUMN IF NOT EXISTS "office_kit_seconds" integer DEFAULT 0;
