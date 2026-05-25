-- Feature: per-device face/registration photos.
-- Captured from the Android app's "Register" launcher (admin passcode gated),
-- pairs a front-camera selfie with the device IMEI and uploads to S3. Each
-- capture is a new row -- the same IMEI may appear arbitrarily many times.
-- IMEI is nullable for non-device-owner installs where TelephonyManager.getImei()
-- throws; the row is still recorded so the photo is discoverable by team.
-- image_url is populated AFTER the S3 PUT succeeds; rows with null image_url
-- represent in-flight or failed uploads and are hidden from the dashboard.
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS "face_photos" (
  "id" bigserial PRIMARY KEY,
  "team_id" text NOT NULL REFERENCES "teams"("id"),
  "hackathon_id" text NOT NULL REFERENCES "hackathons"("id"),
  "device_id" text,
  "imei" text,
  "image_url" text,
  "captured_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_face_photos_hackathon" ON "face_photos" ("hackathon_id", "captured_at");
CREATE INDEX IF NOT EXISTS "idx_face_photos_team" ON "face_photos" ("team_id", "captured_at");
