import {
  pgTable,
  text,
  bigserial,
  integer,
  real,
  timestamp,
  jsonb,
  index,
  boolean,
} from "drizzle-orm/pg-core";

export const hackathons = pgTable("hackathons", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  organiserPasscodeHash: text("organiser_passcode_hash").notNull(),
  status: text("status").default("upcoming").notNull(), // upcoming | active | ended
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const teams = pgTable("teams", {
  id: text("id").primaryKey(),
  hackathonId: text("hackathon_id")
    .references(() => hackathons.id)
    .notNull(),
  name: text("name").notNull(),
  deviceId: text("device_id"),
  members: jsonb("members"), // [{name, role}]
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const eventBatches = pgTable(
  "event_batches",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    teamId: text("team_id")
      .references(() => teams.id)
      .notNull(),
    hackathonId: text("hackathon_id")
      .references(() => hackathons.id)
      .notNull(),
    deviceId: text("device_id").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    taps: integer("taps").default(0),
    textInputs: integer("text_inputs").default(0),
    scrolls: integer("scrolls").default(0),
    appSwitches: integer("app_switches").default(0),
    perAppTaps: jsonb("per_app_taps"),
    foregroundApp: text("foreground_app"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_batches_team").on(table.teamId, table.periodStart),
    index("idx_batches_hackathon").on(table.hackathonId, table.periodStart),
  ]
);

export const appUsage = pgTable(
  "app_usage",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    teamId: text("team_id")
      .references(() => teams.id)
      .notNull(),
    hackathonId: text("hackathon_id")
      .references(() => hackathons.id)
      .notNull(),
    snapshotTime: timestamp("snapshot_time", { withTimezone: true }).notNull(),
    appPackage: text("app_package").notNull(),
    appLabel: text("app_label"),
    foregroundMinutes: real("foreground_minutes").notNull(),
    openCount: integer("open_count").default(0),
  },
  (table) => [index("idx_usage_team").on(table.teamId, table.snapshotTime)]
);

export const cameraEvents = pgTable("camera_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  teamId: text("team_id")
    .references(() => teams.id)
    .notNull(),
  hackathonId: text("hackathon_id")
    .references(() => hackathons.id)
    .notNull(),
  eventTime: timestamp("event_time", { withTimezone: true }).notNull(),
  eventType: text("event_type").default("camera_open"),
});

export const clipboardEvents = pgTable("clipboard_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  teamId: text("team_id")
    .references(() => teams.id)
    .notNull(),
  hackathonId: text("hackathon_id")
    .references(() => hackathons.id)
    .notNull(),
  eventTime: timestamp("event_time", { withTimezone: true }).notNull(),
});

export const reports = pgTable("reports", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  teamId: text("team_id")
    .references(() => teams.id)
    .notNull(),
  hackathonId: text("hackathon_id")
    .references(() => hackathons.id)
    .notNull(),
  reportJson: jsonb("report_json").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  hackathonId: text("hackathon_id")
    .references(() => hackathons.id)
    .notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  targetFilter: text("target_filter").notNull().default("all"), // all | idle | active | offline | custom
  targetMinTaps: integer("target_min_taps"),
  targetMaxTaps: integer("target_max_taps"),
  targetTeamIds: jsonb("target_team_ids"), // specific team IDs if custom
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const deviceVitals = pgTable(
  "device_vitals",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    teamId: text("team_id")
      .references(() => teams.id)
      .notNull(),
    hackathonId: text("hackathon_id")
      .references(() => hackathons.id)
      .notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    batteryLevel: integer("battery_level"),
    temperature: real("temperature"), // celsius
    cpuUsage: real("cpu_usage"), // percentage
  },
  (table) => [
    index("idx_vitals_team").on(table.teamId, table.recordedAt),
  ]
);

export const heartbeats = pgTable(
  "heartbeats",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    teamId: text("team_id")
      .references(() => teams.id)
      .notNull(),
    hackathonId: text("hackathon_id")
      .references(() => hackathons.id)
      .notNull(),
    deviceId: text("device_id").notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull(),
    batteryLevel: integer("battery_level"),
    temperature: real("temperature"),
  },
  (table) => [
    index("idx_heartbeats_device").on(table.deviceId, table.hackathonId),
  ]
);
