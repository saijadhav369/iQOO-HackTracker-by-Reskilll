# Hackathon Device Tracker — Full Technical Specification

## For Claude Code: Build this end-to-end.

---

## What This Is

A system with two parts:

1. **Android app ("HackTracker")** — runs silently on iQOO hackathon devices, tracks how participants use the phone during the hackathon (touches, app usage, camera opens, screen time), and syncs data to a backend. Cannot be uninstalled or disabled without an organiser passcode.

2. **Admin Dashboard (web app)** — organisers see real-time usage data for every team's device during the hackathon. At the end, generates per-team usage reports that feed into judging.

---

## System Architecture

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│  Android App     │──────▶│  Backend API      │◀──────│  Admin Dashboard │
│  (per device)    │ HTTPS │  (REST + WebSocket)│      │  (React web app) │
│                  │       │                    │      │                  │
│  - Accessibility │       │  - Supabase or     │      │  - Live grid     │
│    Service       │       │    Firebase        │      │  - Per-team view │
│  - UsageStats    │       │  - Realtime sub    │      │  - Report export │
│  - Device Admin  │       │  - Auth (passcode) │      │  - Event mgmt    │
│  - Foreground    │       │                    │      │                  │
│    Service       │       │                    │      │                  │
└──────────────────┘       └──────────────────┘       └──────────────────┘
```

---

## PART 1: Android App ("HackTracker")

### 1.1 Core Components

#### A. AccessibilityService — Global Event Tracking

**Purpose:** Count every tap, text input, and scroll across ALL apps on the device.

**Implementation:**

```kotlin
// AccessibilityService config (res/xml/accessibility_config.xml)
<accessibility-service
    android:accessibilityEventTypes="typeViewClicked|typeViewTextChanged|typeViewScrolled|typeWindowStateChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:notificationTimeout="50"
    android:canRetrieveWindowContent="false"
    android:packageNames=""  // empty = ALL apps
    android:settingsActivity=""
    android:description="@string/service_description" />
```

**What it captures (confirmed feasible):**

| Event Type | Android Constant | What We Store |
|---|---|---|
| Every tap/click | `TYPE_VIEW_CLICKED` | timestamp + package_name + count |
| Every text input | `TYPE_VIEW_TEXT_CHANGED` | timestamp + package_name + count (NOT the text content — privacy safe) |
| Every scroll | `TYPE_VIEW_SCROLLED` | timestamp + package_name + count |
| Every app switch | `TYPE_WINDOW_STATE_CHANGED` | timestamp + from_package + to_package |

**Data structure per event batch (sent every 60 seconds):**

```json
{
  "device_id": "iqoo15_team07",
  "hackathon_id": "city_mumbai_2026",
  "timestamp": "2026-05-15T14:32:00Z",
  "period_start": "2026-05-15T14:31:00Z",
  "period_end": "2026-05-15T14:32:00Z",
  "events": {
    "taps": 47,
    "text_inputs": 12,
    "scrolls": 23,
    "app_switches": 3
  },
  "per_app_taps": {
    "com.vivo.pcsuite": 18,
    "com.android.chrome": 14,
    "com.android.camera": 6,
    "com.google.android.apps.docs": 9
  },
  "foreground_app": "com.vivo.pcsuite"
}
```

**Important:** We count events, not capture content. No keystrokes logged, no screen content captured, no personal data. This is a counter, not a spy.

#### B. UsageStatsManager — App Duration Tracking

**Purpose:** Track how long each app was in the foreground during the hackathon window.

**Permission required:** `android.permission.PACKAGE_USAGE_STATS` — must be granted manually in Settings > Apps > Special Access > Usage Access. **Pre-enabled on device before handout.**

**What it captures:**

| Data Point | Method | Accuracy |
|---|---|---|
| Per-app foreground time | `queryUsageStats(INTERVAL_BEST, start, end)` → `getTotalTimeInForeground()` | Per-minute |
| App open/close events | `queryEvents(start, end)` → `MOVE_TO_FOREGROUND` / `MOVE_TO_BACKGROUND` | Per-second |
| Total screen-on time | Sum of all foreground times | Per-minute |

**Polled every 5 minutes** and synced to backend. Provides the "Office Kit: 4h 32m" style data.

#### C. Camera Event Detection

**Purpose:** Count how many times the camera was opened (SnapCode indicator).

**Method:** UsageStatsManager tracks foreground events for `com.android.camera` or the device's camera package. Each `MOVE_TO_FOREGROUND` event = one camera open.

**Alternative fallback:** Register a `BroadcastReceiver` for `android.hardware.action.NEW_PICTURE` and `android.hardware.action.NEW_VIDEO` intents (fires when a photo/video is saved). This catches actual captures, not just camera opens.

#### D. Clipboard Event Tracking

**Purpose:** Count clipboard sync events (indicator of Super Clipboard / Office Kit usage).

**Method:** `ClipboardManager.addPrimaryClipChangedListener()` — fires every time clipboard content changes.

**Limitation (confirmed):** On Android 10+, this only fires when the app is in foreground OR has an active AccessibilityService. Since we HAVE an AccessibilityService, this works. We count clipboard changes, not capture content.

**Store:** timestamp + count per minute. Not the clipboard text.

---

### 1.2 Tamper Protection

#### A. Device Admin — Prevent Uninstall

**Purpose:** Make the app impossible to uninstall without organiser action.

**Implementation:** Register a `DeviceAdminReceiver`. When activated as device admin, Android prevents the app from being uninstalled. To uninstall, user must first deactivate admin — which we intercept.

```kotlin
class HackTrackerAdminReceiver : DeviceAdminReceiver() {
    override fun onDisableRequested(context: Context, intent: Intent): CharSequence {
        // When someone tries to deactivate admin, show passcode prompt
        // If passcode not entered, re-lock the device or navigate away
        val lockIntent = Intent(context, PasscodeActivity::class.java)
        lockIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(lockIntent)
        return "Organiser passcode required to disable HackTracker."
    }
}
```

**Pre-configuration:** Admin activated via ADB before handout:
```bash
adb shell dpm set-active-admin com.reskill.hacktracker/.HackTrackerAdminReceiver
```

#### B. AccessibilityService Self-Monitoring

**Purpose:** Detect if someone navigates to Settings > Accessibility to disable the service.

**Implementation:** The AccessibilityService itself detects when the Settings app opens the Accessibility page (via `TYPE_WINDOW_STATE_CHANGED` for `com.android.settings`). When detected, overlay a passcode prompt or navigate the user away.

```kotlin
override fun onAccessibilityEvent(event: AccessibilityEvent) {
    if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
        val className = event.className?.toString() ?: ""
        if (className.contains("AccessibilitySettings") || 
            className.contains("InstalledAppDetails")) {
            // Show passcode overlay or navigate to home
            showPasscodeChallenge()
        }
    }
    // ... normal tracking logic
}
```

#### C. Foreground Service — Prevent Kill

**Purpose:** Keep the app running even if the user swipes it from recents.

**Implementation:** A persistent foreground service with a small notification ("HackTracker active — tracking your build journey"). Android requires a visible notification for foreground services — this is non-negotiable. Make the notification minimal and branded.

```kotlin
class TrackingService : Service() {
    override fun onCreate() {
        val notification = createNotification("HackTracker", "Tracking your build session")
        startForeground(NOTIFICATION_ID, notification)
    }
}
```

**Also:** Register `onTaskRemoved()` to restart the service if swiped from recents.

#### D. Passcode System

**Purpose:** Only organisers can stop/configure/uninstall the app.

**Implementation:**
- App has a hidden settings screen (accessible by tapping the notification 5 times rapidly, or a specific gesture)
- Settings screen requires a 6-digit passcode (set by organiser during device setup)
- Passcode stored as SHA-256 hash in SharedPreferences (not plaintext)
- Wrong passcode 3 times = lock out for 5 minutes
- With correct passcode, organiser can: stop tracking, export data manually, deactivate device admin, uninstall

---

### 1.3 Hackathon Session Management

#### A. Session Start/Stop

The app tracks within a defined hackathon window. Organiser sets:
- `hackathon_id`: "city_mumbai_2026"
- `team_id`: "team_07"
- `team_name`: "CodeCrafters"  
- `start_time`: ISO timestamp
- `end_time`: ISO timestamp
- `device_id`: auto-generated from device serial

This is configured during device setup (before handout) via the passcode-protected settings screen. Can also be pushed from the backend via Firebase Cloud Messaging (FCM).

#### B. Data Sync

- **Primary:** HTTPS POST to backend API every 60 seconds (event batches)
- **Fallback:** If offline, store in local SQLite database, sync when connectivity restored
- **Bulk sync:** Every 5 minutes, send aggregated UsageStats data
- **End-of-session:** On hackathon end time, generate final report JSON and POST to backend

#### C. Local Storage

SQLite database on device:
- `events` table: raw event counts per minute
- `app_usage` table: per-app foreground time snapshots
- `camera_events` table: timestamps of camera opens
- `clipboard_events` table: timestamps of clipboard changes
- `session` table: hackathon config, team info, timestamps

Total storage estimate: ~50MB for a 24-hour hackathon. Negligible on a 256GB device.

---

### 1.4 Pre-Configuration Checklist (per device)

Before handing to participants, organiser does this for each phone:

1. Install HackTracker APK via ADB: `adb install hacktracker.apk`
2. Activate device admin: `adb shell dpm set-active-admin com.reskill.hacktracker/.HackTrackerAdminReceiver`
3. Enable AccessibilityService: Settings > Accessibility > HackTracker > Enable
4. Grant Usage Access: Settings > Apps > Special Access > Usage Access > HackTracker > Enable
5. Open app, enter organiser passcode, configure: hackathon_id, team_id, team_name, start/end times
6. Verify: notification shows "HackTracker active," tap count incrementing in debug view
7. Lock settings: exit organiser mode

**Time per device:** ~3 minutes. **30 devices = ~90 minutes.**

**Automation option:** Steps 1-2 can be scripted via ADB batch file. Steps 3-4 require manual toggle (Android enforces manual user consent for these permissions — no programmatic bypass, even with device admin). Step 5 can be batch-configured if the backend pushes config via FCM after app install.

---

## PART 2: Backend API

### 2.1 Tech Stack

**Recommended: Supabase (PostgreSQL + Realtime + Auth + Edge Functions)**

Why Supabase:
- Built-in realtime subscriptions (dashboard gets live updates without WebSocket boilerplate)
- PostgreSQL for complex queries (aggregations, per-team comparisons)
- Row Level Security for multi-hackathon isolation
- Free tier handles 30-50 devices easily
- Edge Functions for report generation

**Alternative: Firebase (Firestore + Cloud Functions + Realtime Database)**

Why Firebase:
- FCM for pushing config to devices (start/stop hackathon remotely)
- Firestore for event storage
- Better Android SDK integration
- But: realtime queries are less flexible than PostgreSQL

**Recommendation: Use Supabase for backend + dashboard, Firebase FCM only for push notifications to devices.**

### 2.2 Database Schema

```sql
-- Hackathon events
CREATE TABLE hackathons (
    id TEXT PRIMARY KEY,              -- "city_mumbai_2026"
    name TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    organiser_passcode_hash TEXT NOT NULL,
    status TEXT DEFAULT 'upcoming',   -- upcoming, active, ended
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Teams
CREATE TABLE teams (
    id TEXT PRIMARY KEY,              -- "team_07"
    hackathon_id TEXT REFERENCES hackathons(id),
    name TEXT NOT NULL,
    device_id TEXT,
    members JSONB,                    -- [{name, role}]
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Event batches (60-second intervals from each device)
CREATE TABLE event_batches (
    id BIGSERIAL PRIMARY KEY,
    team_id TEXT REFERENCES teams(id),
    hackathon_id TEXT REFERENCES hackathons(id),
    device_id TEXT NOT NULL,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    taps INTEGER DEFAULT 0,
    text_inputs INTEGER DEFAULT 0,
    scrolls INTEGER DEFAULT 0,
    app_switches INTEGER DEFAULT 0,
    per_app_taps JSONB,               -- {"com.vivo.pcsuite": 18, ...}
    foreground_app TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- App usage snapshots (5-minute intervals)
CREATE TABLE app_usage (
    id BIGSERIAL PRIMARY KEY,
    team_id TEXT REFERENCES teams(id),
    hackathon_id TEXT REFERENCES hackathons(id),
    snapshot_time TIMESTAMPTZ NOT NULL,
    app_package TEXT NOT NULL,
    app_label TEXT,                    -- human-readable name
    foreground_minutes REAL NOT NULL,
    open_count INTEGER DEFAULT 0
);

-- Camera events
CREATE TABLE camera_events (
    id BIGSERIAL PRIMARY KEY,
    team_id TEXT REFERENCES teams(id),
    hackathon_id TEXT REFERENCES hackathons(id),
    event_time TIMESTAMPTZ NOT NULL,
    event_type TEXT DEFAULT 'camera_open'  -- camera_open, photo_taken
);

-- Clipboard events  
CREATE TABLE clipboard_events (
    id BIGSERIAL PRIMARY KEY,
    team_id TEXT REFERENCES teams(id),
    hackathon_id TEXT REFERENCES hackathons(id),
    event_time TIMESTAMPTZ NOT NULL
    -- NO content stored. Just the timestamp.
);

-- Final reports (generated at hackathon end)
CREATE TABLE reports (
    id BIGSERIAL PRIMARY KEY,
    team_id TEXT REFERENCES teams(id),
    hackathon_id TEXT REFERENCES hackathons(id),
    report_json JSONB NOT NULL,
    generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_batches_team ON event_batches(team_id, period_start);
CREATE INDEX idx_batches_hackathon ON event_batches(hackathon_id, period_start);
CREATE INDEX idx_usage_team ON app_usage(team_id, snapshot_time);
```

### 2.3 API Endpoints

```
POST   /api/events/batch          — Device sends 60-second event batch
POST   /api/usage/snapshot        — Device sends 5-minute app usage snapshot
POST   /api/camera/event          — Device sends camera open/photo event
POST   /api/clipboard/event       — Device sends clipboard change event
POST   /api/device/heartbeat      — Device pings every 30 seconds (alive check)

GET    /api/hackathon/:id/live    — Dashboard gets live data (use Supabase realtime subscription instead)
GET    /api/hackathon/:id/teams   — List all teams for a hackathon
GET    /api/team/:id/report       — Get final report for a team
GET    /api/team/:id/timeline     — Get minute-by-minute timeline for a team
GET    /api/hackathon/:id/leaderboard — Aggregated stats across all teams

POST   /api/hackathon             — Create a hackathon (admin auth)
POST   /api/team                  — Register a team (admin auth)
POST   /api/hackathon/:id/start   — Start hackathon (pushes start signal to all devices via FCM)
POST   /api/hackathon/:id/end     — End hackathon (pushes stop signal, triggers report generation)

POST   /api/auth/verify-passcode  — Verify organiser passcode
```

### 2.4 Report Generation

At hackathon end (triggered automatically or manually), an Edge Function generates a report per team:

```json
{
  "team_id": "team_07",
  "team_name": "CodeCrafters",
  "hackathon": "city_mumbai_2026",
  "duration_hours": 12,

  "summary": {
    "total_taps": 14847,
    "total_text_inputs": 2340,
    "total_scrolls": 1872,
    "total_app_switches": 214,
    "total_screen_on_minutes": 587,
    "total_camera_opens": 17,
    "total_clipboard_events": 89
  },

  "office_kit": {
    "foreground_minutes": 272,
    "tap_count": 4218,
    "percentage_of_total_taps": 28.4,
    "first_used": "2026-05-15T09:12:00Z",
    "last_used": "2026-05-15T20:48:00Z"
  },

  "camera": {
    "total_opens": 17,
    "photos_taken": 14,
    "first_open": "2026-05-15T09:45:00Z",
    "snapcode_indicator": "high"  // high = 10+, medium = 5-9, low = 1-4
  },

  "browser": {
    "foreground_minutes": 168,
    "tap_count": 3891
  },

  "top_apps": [
    {"package": "com.vivo.pcsuite", "label": "Office Kit", "minutes": 272, "taps": 4218},
    {"package": "com.android.chrome", "label": "Chrome", "minutes": 168, "taps": 3891},
    {"package": "com.android.camera", "label": "Camera", "minutes": 23, "taps": 412},
    {"package": "com.google.android.apps.docs", "label": "Files", "minutes": 12, "taps": 187}
  ],

  "activity_timeline": [
    {"hour": "09:00-10:00", "taps": 890, "primary_app": "Office Kit"},
    {"hour": "10:00-11:00", "taps": 1240, "primary_app": "Office Kit"},
    {"hour": "11:00-12:00", "taps": 1100, "primary_app": "Chrome"}
    // ... one entry per hour
  ],

  "integrity_signals": {
    "device_active_hours": 9.78,
    "gaps_over_30min": 1,
    "consistent_usage": true,
    "office_kit_used_genuinely": true  // >30min + >500 taps
  }
}
```

---

## PART 3: Admin Dashboard (Web App)

### 3.1 Tech Stack

**React + Tailwind + Supabase JS client + Recharts**

Single-page app. Deployed on Vercel or Netlify. Authenticated via organiser passcode (same as device passcode, but verified against backend).

### 3.2 Screens

#### A. Hackathon Manager

- Create/edit hackathons (name, date, start/end times)
- Register teams (name, device_id assignment)
- Start/Stop hackathon (sends FCM push to all devices)
- Device health check (which devices are online, last heartbeat)

#### B. Live Dashboard (the main screen during the hackathon)

**Grid view:** All teams in a grid. Each card shows:
- Team name
- Current active app (live)
- Total taps so far (live counter)
- Office Kit time so far
- Camera opens so far  
- Status indicator: 🟢 active / 🟡 idle (>5 min no taps) / 🔴 offline (>5 min no heartbeat)

**Sorting:** By total taps, by Office Kit time, by camera opens, by activity level

**Click into a team** → detailed view with:
- Minute-by-minute tap timeline (bar chart)
- App usage pie chart (live updating)
- Camera event timeline
- Clipboard event count
- Current foreground app

#### C. Reports View (after hackathon ends)

- Table of all teams with summary stats
- Sort by any column (taps, Office Kit %, camera opens, etc.)
- Click to expand full report JSON
- Export as CSV or PDF
- Side-by-side comparison: select 2-3 teams and compare their timelines
- "Integrity flags" column: highlights teams with suspiciously low phone usage

#### D. Event Feed (optional, for MC/narration)

A scrolling feed of notable events:
- "Team 07 just opened Camera for the 10th time — heavy SnapCode usage!"
- "Team 12 has been on Office Kit for 3 hours straight"
- "Team 03 hasn't touched the phone in 45 minutes"
- Configurable thresholds for what triggers a feed item

### 3.3 Realtime Updates

Use Supabase Realtime subscriptions:

```javascript
const channel = supabase
  .channel('hackathon-live')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'event_batches',
    filter: `hackathon_id=eq.${hackathonId}`
  }, (payload) => {
    updateTeamCard(payload.new);
  })
  .subscribe();
```

Dashboard updates every time a device sends a batch (every 60 seconds). No polling needed.

---

## PART 4: Key Known Limitations (be honest about these)

| Limitation | Impact | Mitigation |
|---|---|---|
| AccessibilityService requires manual enable in Settings | Can't be done programmatically | Pre-enable on every device before handout (~10 sec per phone) |
| UsageStats permission requires manual grant | Same as above | Pre-grant before handout |
| Foreground service shows a persistent notification | Participant sees "HackTracker active" | Make it minimal and branded — "Building something great 🔥" |
| Android may battery-optimize the service | Could pause tracking during inactivity | Exclude app from battery optimization in Settings (pre-configure) |
| Clipboard listener only works with AccessibilityService on Android 10+ | Without it, clipboard events won't fire in background | We have AccessibilityService, so this works |
| Device admin can be bypassed in Safe Mode | Participant could boot to safe mode, disable admin, uninstall | Safe Mode disables all third-party apps — they can't USE the phone for the hackathon in safe mode, so this is self-defeating |
| Network dependency for realtime sync | No WiFi = no live dashboard updates | Local SQLite stores everything, syncs when back online. Reports generated from local data if needed |

---

## PART 5: Privacy & Ethics

**This must be communicated clearly to participants before the hackathon:**

1. The tracking app counts taps, app usage time, and camera opens. It does NOT capture: text content, screenshots, photos, clipboard content, browsing history, or any personal data.
2. The app only tracks during the defined hackathon window (start time to end time).
3. The data is used solely for hackathon evaluation — specifically the "Office Kit Workflow" rubric criterion.
4. Participants consent to tracking by accepting their hackathon device. This is stated in the registration terms.
5. Data is deleted 30 days after the hackathon.

**Include this in the registration form, the device handout process, and the opening ceremony.**

---

## PART 6: Build Priority

### Phase 1 (MVP — build this first):
- Android app with AccessibilityService (tap counting per app)
- UsageStatsManager integration (app foreground times)
- Device Admin (prevent uninstall)
- Passcode protection
- Local SQLite storage
- HTTP sync to Supabase every 60 seconds
- Basic admin dashboard: hackathon setup + live grid with tap counts

### Phase 2 (before first city round):
- Camera event tracking
- Clipboard event tracking  
- Report generation
- Dashboard: detailed team view, timeline charts
- FCM integration for remote start/stop
- CSV/PDF export

### Phase 3 (nice to have):
- Event feed for MC narration
- Side-by-side team comparison
- Integrity flagging system
- Historical hackathon data comparison
- Batch device setup script via ADB

---

## PART 7: Testing Checklist

Before first use at a real hackathon:

- [ ] Install on iQOO 15 — verify all services start
- [ ] Run for 2 hours — verify no battery drain beyond 5%
- [ ] Run for 8 hours — verify service stays alive, no Android kills
- [ ] Open Office Kit, use screen mirroring — verify taps and foreground time captured correctly
- [ ] Open Camera 10 times — verify count matches
- [ ] Copy-paste 5 times — verify clipboard events captured
- [ ] Switch between 8 apps rapidly — verify app switch count
- [ ] Swipe app from recents — verify service restarts
- [ ] Try to uninstall — verify device admin blocks it
- [ ] Try to disable AccessibilityService — verify passcode prompt appears
- [ ] Kill WiFi for 30 min, reconnect — verify offline events sync
- [ ] Check dashboard shows live data within 60 seconds of device activity
- [ ] Generate end-of-hackathon report — verify all numbers match manual count
- [ ] Test with 5 devices simultaneously — verify backend handles concurrent writes
- [ ] Test with 30 devices simultaneously — verify no lag on dashboard 