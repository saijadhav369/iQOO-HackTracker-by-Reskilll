-- Feature: optional contact fields on the face-photo registration row.
-- Captured from the Android Register activity (Name / Email / Phone Number
-- inputs above the Capture button). All nullable — the organiser may leave
-- any combination blank at handover. Phone IMEI / device_id are unaffected.
-- Idempotent: safe to run multiple times.

ALTER TABLE "face_photos"
  ADD COLUMN IF NOT EXISTS "participant_name" text,
  ADD COLUMN IF NOT EXISTS "email" text,
  ADD COLUMN IF NOT EXISTS "phone" text;
