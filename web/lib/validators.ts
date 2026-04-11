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
  }),
  per_app_taps: z.record(z.string(), z.number()).optional(),
  per_app_scrolls: z.record(z.string(), z.number()).optional(),
  per_app_text_inputs: z.record(z.string(), z.number()).optional(),
  foreground_app: z.string().optional(),
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
  last_notification_id: z.number().int().optional(),
});

export const cameraEventSchema = z.object({
  device_id: z.string(),
  hackathon_id: z.string(),
  team_id: z.string(),
  event_time: z.string(),
  event_type: z.string().default("camera_open"),
});

export const clipboardEventSchema = z.object({
  device_id: z.string(),
  hackathon_id: z.string(),
  team_id: z.string(),
  event_time: z.string(),
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
