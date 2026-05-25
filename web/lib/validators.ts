import { z } from "zod/v4";

// Device-facing endpoints
export const eventBatchSchema = z.object({
  device_id: z.string(),
  hackathon_id: z.string(),
  team_id: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  events: z.object({
    taps: z.number().int().default(0),
    text_inputs: z.number().int().default(0),
    scrolls: z.number().int().default(0),
    app_switches: z.number().int().default(0),
    long_presses: z.number().int().default(0),
    notifications: z.number().int().default(0),
    keyboard_active_seconds: z.number().int().default(0),
  }),
  per_app_taps: z.record(z.string(), z.number()).optional(),
  per_app_scrolls: z.record(z.string(), z.number()).optional(),
  per_app_text_inputs: z.record(z.string(), z.number()).optional(),
  foreground_app: z.string().optional(),
  office_kit_seconds: z.number().int().optional(),
});

export const usageSnapshotSchema = z.object({
  device_id: z.string(),
  hackathon_id: z.string(),
  team_id: z.string(),
  snapshot_time: z.string(),
  apps: z.array(
    z.object({
      package: z.string(),
      label: z.string().optional(),
      foreground_minutes: z.number(),
      open_count: z.number().int().default(0),
    })
  ),
});

export const heartbeatSchema = z.object({
  device_id: z.string(),
  hackathon_id: z.string(),
  team_id: z.string(),
  battery_level: z.number().int().optional(),
  temperature: z.number().optional(),
  cpu_usage: z.number().optional(),
  thermal_headroom: z.number().optional(),
  thermal_status: z.number().int().optional(),
  monster_mode: z.boolean().optional(),
  // Feature 9 — expanded vitals. All optional so old clients keep validating.
  mem_available_mb: z.number().int().optional(),
  mem_total_mb: z.number().int().optional(),
  is_charging: z.boolean().optional(),
  charging_type: z.string().optional(),
  network_type: z.string().optional(),
  cellular_dbm: z.number().int().optional(),
  wifi_rssi: z.number().int().optional(),
  data_rx_mb_since_boot: z.number().optional(),
  data_tx_mb_since_boot: z.number().optional(),
  last_notification_id: z.number().int().optional(),
  current_session_start_ts: z.string().optional(),
  clean_exit: z.boolean().optional(),
});

export const crashLogEntrySchema = z.object({
  device_id: z.string(),
  hackathon_id: z.string(),
  team_id: z.string(),
  occurred_at: z.string(),
  thread_name: z.string().optional().nullable(),
  stacktrace: z.string().optional().nullable(),
  foreground_app: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
});

export const crashLogBatchSchema = z.object({
  crashes: z.array(crashLogEntrySchema),
});

export const cameraEventSchema = z.object({
  device_id: z.string(),
  hackathon_id: z.string(),
  team_id: z.string(),
  event_time: z.string(),
  event_type: z.string().default("camera_open"),
});

export const sensorAggregateSchema = z.object({
  device_id: z.string(),
  hackathon_id: z.string(),
  team_id: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  accel_mean: z.number().nullable().optional(),
  accel_stddev: z.number().nullable().optional(),
  accel_peak: z.number().nullable().optional(),
  gyro_mean: z.number().nullable().optional(),
  gyro_stddev: z.number().nullable().optional(),
  gyro_peak: z.number().nullable().optional(),
  magneto_mean: z.number().nullable().optional(),
  lux_mean: z.number().nullable().optional(),
  proximity_near_pct: z.number().nullable().optional(),
  steps_delta: z.number().int().nullable().optional(),
});

export const sensorBatchSchema = z.object({
  aggregates: z.array(sensorAggregateSchema),
});

export const clipboardEventSchema = z.object({
  device_id: z.string(),
  hackathon_id: z.string(),
  team_id: z.string(),
  event_time: z.string(),
});

// Feature 10 — hardened tamper detection. Batched events from the device.
export const tamperEventEntrySchema = z.object({
  device_id: z.string(),
  hackathon_id: z.string(),
  team_id: z.string(),
  type: z.string(),
  // Free-form per-type payload; defaulted so events with no detail validate.
  detail: z.record(z.string(), z.unknown()).nullable().optional(),
  occurred_at: z.string(),
});

export const tamperBatchSchema = z.object({
  events: z.array(tamperEventEntrySchema),
});

// Admin endpoints
export const createHackathonSchema = z.object({
  id: z.string(),
  name: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  passcode: z.string().min(6),
});

export const createTeamSchema = z.object({
  id: z.string(),
  hackathon_id: z.string(),
  name: z.string(),
  device_id: z.string().optional(),
  members: z
    .array(z.object({ name: z.string(), role: z.string().optional() }))
    .optional(),
});

export const verifyPasscodeSchema = z.object({
  hackathon_id: z.string(),
  passcode: z.string(),
});

// Feature 7: on-demand screenshots — multipart device upload acks via form fields
export const screenshotUploadFormSchema = z.object({
  id: z.coerce.number().int().positive(),
  device_id: z.string().optional(),
});
