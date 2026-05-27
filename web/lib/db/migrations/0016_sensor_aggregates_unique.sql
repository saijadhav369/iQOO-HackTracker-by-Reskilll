-- Feature 8 / 10 follow-up: sensor_aggregates dedupe key
--
-- The /api/sensors/batch route uses ON CONFLICT DO NOTHING with target
-- (team_id, period_start), but no matching unique index existed -- every
-- insert was failing with "there is no unique or exclusion constraint
-- matching the ON CONFLICT specification" and surfacing as a 400 to the
-- phone. The sensor batches were silently dropped for every device.
--
-- The right key is (team_id, device_id, period_start): two phones in the
-- same team naturally produce sensor windows with the same period_start,
-- so the previous two-column key would have dropped one of them anyway.
-- device_id is nullable -- legacy null rows from before commit 8aaa14b
-- remain unconstrained against each other (Postgres treats NULL as distinct
-- in unique indexes).
--
-- Idempotent.

CREATE UNIQUE INDEX IF NOT EXISTS "uq_sensor_aggregates_team_device_period"
  ON "sensor_aggregates" ("team_id", "device_id", "period_start");
