import {
  pgTable,
  text,
  bigserial,
  integer,
  real,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  boolean,
} from "drizzle-orm/pg-core";

export const hackathons = pgTable("hackathons", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  organiserPasscodeHash: text("organiser_passcode_hash").notNull(),
  status: text("status").default("upcoming").notNull(), // upcoming | active | ended
  currentLight: text("current_light").default("green").notNull(), // green | red — venue signal only
  lightChangedAt: timestamp("light_changed_at", { withTimezone: true }),
  scoringConfig: jsonb("scoring_config"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const lightTransitions = pgTable(
  "light_transitions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    hackathonId: text("hackathon_id")
      .references(() => hackathons.id)
      .notNull(),
    light: text("light").notNull(), // green | red
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull(),
    changedBy: text("changed_by"),
  },
  (table) => [
    index("idx_light_transitions_hackathon").on(table.hackathonId, table.changedAt),
  ]
);

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

// One row per phone registered against a team. A team has up to N members,
// each with their own device. The slot (1, 2, 3...) is the display ordinal
// and is unique within a team; the member_name is free-form for "Member 1: Saija".
// device_id is Settings.Secure.ANDROID_ID — also the partition key for
// telemetry tables (event_batches, device_vitals, etc.), so this table is the
// lookup that turns a per-device telemetry row into a named member.
export const teamMembers = pgTable(
  "team_members",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    teamId: text("team_id")
      .references(() => teams.id)
      .notNull(),
    hackathonId: text("hackathon_id")
      .references(() => hackathons.id)
      .notNull(),
    deviceId: text("device_id").notNull(),
    slot: integer("slot").notNull(),
    memberName: text("member_name").notNull(),
    registeredAt: timestamp("registered_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("uq_team_members_team_slot").on(t.teamId, t.slot),
    uniqueIndex("uq_team_members_team_device").on(t.teamId, t.deviceId),
    index("idx_team_members_team").on(t.teamId),
  ]
);

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
    keyboardActiveSeconds: integer("keyboard_active_seconds").default(0),
    officeKitSeconds: integer("office_kit_seconds").default(0),
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
    // Nullable for back-compat with snapshots inserted before multi-phone teams
    // landed. New writes populate it; team-detail per-member view filters on it.
    deviceId: text("device_id"),
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
  deviceId: text("device_id"), // nullable for back-compat
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
  deviceId: text("device_id"), // nullable for back-compat
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
    // Nullable for back-compat with rows inserted before multi-phone teams
    // landed. The leaderboard partitions vitals by (teamId, deviceId) to
    // avoid phantom compile spikes from interleaved phones — see
    // deriveVitalsPerTeam in /api/hackathon/[id]/leaderboard.
    deviceId: text("device_id"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    batteryLevel: integer("battery_level"),
    temperature: real("temperature"), // celsius
    cpuUsage: real("cpu_usage"), // percentage (actually device memory pressure — see TrackingRepository)
    thermalHeadroom: real("thermal_headroom"), // PowerManager.getThermalHeadroom: 0..1+ (1.0 = throttling threshold)
    thermalStatus: integer("thermal_status"), // PowerManager.getCurrentThermalStatus: 0=NONE .. 7=SHUTDOWN (4=SEVERE)
    monsterMode: boolean("monster_mode"), // iQOO high-performance mode (best-effort vendor read)
    // Feature 9 — expanded vitals. All nullable so old APKs keep posting unchanged.
    memAvailableMb: integer("mem_available_mb"), // ActivityManager available RAM (MB)
    memTotalMb: integer("mem_total_mb"), // ActivityManager total RAM (MB)
    isCharging: boolean("is_charging"), // power source plugged in
    chargingType: text("charging_type"), // ac | usb | wireless | none
    networkType: text("network_type"), // wifi | cellular | vpn | none
    cellularDbm: integer("cellular_dbm"), // TelephonyManager signal strength (dBm)
    wifiRssi: integer("wifi_rssi"), // WifiManager RSSI (dBm)
    dataRxMb: real("data_rx_mb"), // TrafficStats total received since boot (MB)
    dataTxMb: real("data_tx_mb"), // TrafficStats total transmitted since boot (MB)
  },
  (table) => [
    index("idx_vitals_team").on(table.teamId, table.recordedAt),
  ]
);

export const sensorAggregates = pgTable(
  "sensor_aggregates",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    teamId: text("team_id")
      .references(() => teams.id)
      .notNull(),
    hackathonId: text("hackathon_id")
      .references(() => hackathons.id)
      .notNull(),
    deviceId: text("device_id"),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    accelMean: real("accel_mean"),
    accelStddev: real("accel_stddev"),
    accelPeak: real("accel_peak"),
    gyroMean: real("gyro_mean"),
    gyroStddev: real("gyro_stddev"),
    gyroPeak: real("gyro_peak"),
    magnetoMean: real("magneto_mean"),
    luxMean: real("lux_mean"),
    proximityNearPct: real("proximity_near_pct"),
    stepsDelta: integer("steps_delta"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_sensors_team").on(table.teamId, table.periodStart),
    index("idx_sensors_hackathon").on(table.hackathonId, table.periodStart),
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
    lastCleanExit: boolean("last_clean_exit").default(true).notNull(),
  },
  (table) => [
    index("idx_heartbeats_device").on(table.deviceId, table.hackathonId),
  ]
);

export const organiserAlerts = pgTable(
  "organiser_alerts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    hackathonId: text("hackathon_id")
      .references(() => hackathons.id)
      .notNull(),
    teamId: text("team_id")
      .references(() => teams.id)
      .notNull(),
    type: text("type").notNull(), // idle_warning | ...future
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_organiser_alerts_hackathon").on(table.hackathonId, table.createdAt),
    index("idx_organiser_alerts_team_type").on(table.teamId, table.type, table.createdAt),
  ]
);

export const screenshotRequests = pgTable(
  "screenshot_requests",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    teamId: text("team_id")
      .references(() => teams.id)
      .notNull(),
    hackathonId: text("hackathon_id")
      .references(() => hackathons.id)
      .notNull(),
    // Target this request at a specific phone. NULL = any phone in the team
    // (the legacy un-targeted behaviour, kept for backward compat).
    deviceId: text("device_id"),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    imageUrl: text("image_url"),
    status: text("status").default("pending").notNull(), // pending | captured | failed
  },
  (table) => [
    index("idx_screenshot_requests_team").on(table.teamId, table.requestedAt),
    index("idx_screenshot_requests_team_status").on(
      table.teamId,
      table.status,
      table.requestedAt
    ),
  ]
);

export const tamperEvents = pgTable(
  "tamper_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    teamId: text("team_id")
      .references(() => teams.id)
      .notNull(),
    hackathonId: text("hackathon_id")
      .references(() => hackathons.id)
      .notNull(),
    deviceId: text("device_id"), // nullable for back-compat; new writes populate
    // settings_page_open | adb_toggled | time_drift | safe_mode_boot |
    // package_added | package_removed | lock_task_engaged | ...future
    type: text("type").notNull(),
    detail: jsonb("detail"), // type-specific payload (e.g. {heading}, {newValue}, {drift_ms}, {package})
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    // resolvedAt backs the dashboard "unresolved count" badge. Null = unresolved.
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_tamper_team").on(table.teamId, table.occurredAt),
    index("idx_tamper_hackathon").on(table.hackathonId, table.occurredAt),
  ]
);

export const crashLogs = pgTable(
  "crash_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    teamId: text("team_id")
      .references(() => teams.id)
      .notNull(),
    hackathonId: text("hackathon_id")
      .references(() => hackathons.id)
      .notNull(),
    deviceId: text("device_id"), // nullable for back-compat; new writes populate
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    threadName: text("thread_name"),
    stacktrace: text("stacktrace"),
    foregroundApp: text("foreground_app"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_crash_logs_team").on(table.teamId, table.occurredAt),
    index("idx_crash_logs_hackathon").on(table.hackathonId, table.occurredAt),
  ]
);

// Registration face photos captured from the Android "Register" launcher.
// Each capture is one row -- the same imei may appear arbitrarily many times.
// imei is nullable: non-device-owner installs can't read it, but we still
// persist the photo + team mapping so it's not lost.
export const facePhotos = pgTable(
  "face_photos",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    teamId: text("team_id")
      .references(() => teams.id)
      .notNull(),
    hackathonId: text("hackathon_id")
      .references(() => hackathons.id)
      .notNull(),
    deviceId: text("device_id"),
    imei: text("imei"),
    // Populated after the S3 PUT succeeds. Null = upload in-flight or rolled
    // back; the list endpoint filters those out.
    imageUrl: text("image_url"),
    // Optional contact details typed on the phone above the Capture button.
    // All nullable — the organiser may leave any combination blank at handover.
    participantName: text("participant_name"),
    email: text("email"),
    phone: text("phone"),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_face_photos_hackathon").on(table.hackathonId, table.capturedAt),
    index("idx_face_photos_team").on(table.teamId, table.capturedAt),
  ]
);
