-- Feature 5: Crashed vs Offline + crash log capture
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS "crash_logs" (
  "id" bigserial PRIMARY KEY,
  "team_id" text NOT NULL REFERENCES "teams"("id"),
  "hackathon_id" text NOT NULL REFERENCES "hackathons"("id"),
  "occurred_at" timestamptz NOT NULL,
  "thread_name" text,
  "stacktrace" text,
  "foreground_app" text,
  "reason" text,
  "created_at" timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_crash_logs_team" ON "crash_logs" ("team_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "idx_crash_logs_hackathon" ON "crash_logs" ("hackathon_id", "occurred_at");

ALTER TABLE "heartbeats"
  ADD COLUMN IF NOT EXISTS "last_clean_exit" boolean DEFAULT true NOT NULL;
