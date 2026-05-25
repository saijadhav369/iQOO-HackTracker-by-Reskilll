-- Feature 9: Expanded device vitals
-- New per-heartbeat telemetry on device_vitals: memory, charging, network,
-- signal strength, and cumulative data counters.
-- All nullable so pre-existing APKs keep posting unchanged.
-- Idempotent: safe to run multiple times.
-- (Numbered 0010 because 0009_hardware_metrics.sql already exists.)

ALTER TABLE "device_vitals" ADD COLUMN IF NOT EXISTS "mem_available_mb" integer;
ALTER TABLE "device_vitals" ADD COLUMN IF NOT EXISTS "mem_total_mb" integer;
ALTER TABLE "device_vitals" ADD COLUMN IF NOT EXISTS "is_charging" boolean;
ALTER TABLE "device_vitals" ADD COLUMN IF NOT EXISTS "charging_type" text;
ALTER TABLE "device_vitals" ADD COLUMN IF NOT EXISTS "network_type" text;
ALTER TABLE "device_vitals" ADD COLUMN IF NOT EXISTS "cellular_dbm" integer;
ALTER TABLE "device_vitals" ADD COLUMN IF NOT EXISTS "wifi_rssi" integer;
ALTER TABLE "device_vitals" ADD COLUMN IF NOT EXISTS "data_rx_mb" real;
ALTER TABLE "device_vitals" ADD COLUMN IF NOT EXISTS "data_tx_mb" real;
