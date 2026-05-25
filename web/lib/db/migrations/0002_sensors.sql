-- Feature 2: Sensor tracking aggregates (60s windows)
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS "sensor_aggregates" (
  "id" bigserial PRIMARY KEY,
  "team_id" text NOT NULL REFERENCES "teams"("id"),
  "hackathon_id" text NOT NULL REFERENCES "hackathons"("id"),
  "device_id" text,
  "period_start" timestamptz NOT NULL,
  "period_end" timestamptz NOT NULL,
  "accel_mean" real,
  "accel_stddev" real,
  "accel_peak" real,
  "gyro_mean" real,
  "gyro_stddev" real,
  "gyro_peak" real,
  "magneto_mean" real,
  "lux_mean" real,
  "proximity_near_pct" real,
  "steps_delta" integer,
  "created_at" timestamptz DEFAULT now()
);

-- Idempotency for POST /api/sensors/batch — duplicate (team, period_start)
-- payloads from APK retries get swallowed by ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_sensors_team_period"
  ON "sensor_aggregates" ("team_id", "period_start");

CREATE INDEX IF NOT EXISTS "idx_sensors_team"
  ON "sensor_aggregates" ("team_id", "period_start");

CREATE INDEX IF NOT EXISTS "idx_sensors_hackathon"
  ON "sensor_aggregates" ("hackathon_id", "period_start");
