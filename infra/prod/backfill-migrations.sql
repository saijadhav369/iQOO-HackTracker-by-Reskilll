-- One-shot bootstrap of the _migrations tracking table on the EC2 Postgres.
--
-- The prod DB was hydrated by pg_dump from Neon, so migrations 0001-0012
-- are physically applied (tables exist, indexes exist) but the new tracked
-- migrator has no idea — without this bootstrap, `pnpm db:migrate` would
-- try to re-run 0001 and fail on already-existing tables.
--
-- This file marks 0001-0012 as already applied, so the runner only sees
-- 0013 as pending. Verified against prod schema 2026-05-27:
--   - All 12 prior migrations' tables exist
--   - team_members + device_id columns from 0013 are NOT yet there
--
-- Idempotent: ON CONFLICT DO NOTHING. Safe to re-run.

CREATE TABLE IF NOT EXISTS "_migrations" (
  "filename" text PRIMARY KEY,
  "applied_at" timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "_migrations" (filename) VALUES
  ('0001_light.sql'),
  ('0002_sensors.sql'),
  ('0003_keyboard.sql'),
  ('0005_crashes.sql'),
  ('0006_idle_warnings.sql'),
  ('0007_screenshots.sql'),
  ('0008_scoring.sql'),
  ('0009_hardware_metrics.sql'),
  ('0010_vitals.sql'),
  ('0011_tamper.sql'),
  ('0012_face_photos.sql')
ON CONFLICT (filename) DO NOTHING;

SELECT filename FROM "_migrations" ORDER BY filename;
