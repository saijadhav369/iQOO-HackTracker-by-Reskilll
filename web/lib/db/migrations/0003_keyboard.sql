-- Feature 3: Keyboard active time (seconds the IME window was open per batch period)
-- Idempotent: safe to run multiple times.

ALTER TABLE "event_batches"
  ADD COLUMN IF NOT EXISTS "keyboard_active_seconds" integer DEFAULT 0;
