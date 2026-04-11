# HackTracker by Reskill — Complete Setup Guide

## What This Is

HackTracker is a hackathon device tracking system with two parts:
1. **Android App** — Runs silently on hackathon devices, tracks taps, app usage, camera opens, battery, temperature, RAM, and syncs data to a backend
2. **Web Dashboard** — Organisers see real-time usage data for every team's device, send push notifications, and generate reports

---

## Live Production URLs

- **Dashboard**: https://iqoo-hacktracker-by-reskilll-production.up.railway.app/login
- **API Base**: https://iqoo-hacktracker-by-reskilll-production.up.railway.app/api
- **GitHub**: https://github.com/sam25kat/iQOO-HackTracker-by-Reskilll
- **APK**: `android/app/build/outputs/apk/debug/app-debug.apk`

---

## System Requirements

### Web Dashboard
- Deployed on Railway (already live)
- Neon PostgreSQL database (already configured)
- No local setup needed — just open the dashboard URL

### Android Devices (Participant Phones)
- Android 8+ (API 26+)
- Internet connectivity (WiFi or mobile data)

---

## PART 1: Dashboard — Creating a Hackathon

1. Open https://iqoo-hacktracker-by-reskilll-production.up.railway.app/login
2. Click **"Create Hackathon"** tab
3. Fill in:
   - **Hackathon ID**: e.g. `iqoo_mumbai_2026` (lowercase, no spaces — this goes on every phone)
   - **Hackathon Name**: e.g. `iQOO Mumbai Hackathon 2026`
   - **Start Time**: When the hackathon begins
   - **End Time**: When it ends
   - **Organiser Passcode**: 6+ digit code (used on phones AND to login to dashboard)
4. Click **"Create & Enter Dashboard"**

To sign into an existing hackathon, use the **"Sign In"** tab with the Hackathon ID + Passcode.

---

## PART 2: Per-Device Setup (Before Handout)

**Time per device: ~3 minutes**
**30 devices = ~90 minutes**

Do this for EACH hackathon phone before giving to participants:

### Step 1: Install the App

**Via USB + ADB (fastest for batch setup):**
```bash
# Connect phone via USB, enable USB Debugging on phone
# Settings → About Phone → tap Build Number 7 times → Developer Options → USB Debugging ON
adb install app-debug.apk
```

**Via file transfer:**
- Send `app-debug.apk` to phone (Telegram, email, Google Drive, USB copy)
- Open on phone → Install
- If Google Play Protect blocks: Disable Play Protect temporarily, or use ADB install

### Step 2: Grant Permissions

These MUST be done manually — Android requires user consent:

1. **Accessibility Service** (tracks taps, scrolls, app switches):
   - Settings → Accessibility → Downloaded apps/services → **HackTracker by Reskill** → Turn **ON**
   - Confirm any warning dialogs

2. **Usage Access** (tracks which apps are used and for how long):
   - Settings → Apps → Special Access → Usage Access → **HackTracker by Reskill** → **Allow**

3. **Notification Permission** (for persistent tracking notification + push notifications from organiser):
   - Will be prompted when app starts — tap **Allow**
   - If missed: Settings → Notifications → HackTracker by Reskill → Allow
   - Also enable **Heads-up / Banner** notifications for push notifications to show

4. **Battery Optimization** (prevents Android from killing the service):
   - Settings → Battery → Battery Optimization → HackTracker → **Don't Optimize**
   - On Vivo/iQOO: also Settings → Battery → Background Power Consumption → HackTracker → Allow

### Step 3: Configure the App

Open HackTracker by Reskill. Fill in the Setup screen:

| Field | What to enter |
|-------|---------------|
| **API URL** | `https://iqoo-hacktracker-by-reskilll-production.up.railway.app/api` |
| **Hackathon ID** | Same ID you created on the dashboard, e.g. `iqoo_mumbai_2026` |
| **Team ID** | Unique per phone, e.g. `team_01`, `team_02`, ... `team_30` |
| **Team Name** | The team's name, e.g. `CodeCrafters` |
| **Passcode** | Same organiser passcode you set when creating the hackathon |

Hit **"Save & Start Tracking"**

A popup asks to activate **Device Admin** — tap **Activate**. This prevents participants from uninstalling the app.

### Step 4: Verify

- Persistent notification appears: "HackTracker by Reskill — Tracking your build session"
- Status shows "TRACKING" with tap counter
- On the dashboard, the team appears in the grid within 60 seconds
- Status dot turns green (active)

### Step 5: Lock & Hand Out

- Press home to leave the app
- The app continues tracking in the background
- Hand the phone to the participant
- Teams auto-register on the dashboard — no need to add them manually

---

## PART 3: During the Hackathon (Organiser Actions)

### Live Dashboard
- URL: https://iqoo-hacktracker-by-reskilll-production.up.railway.app/dashboard/YOUR_HACKATHON_ID
- Shows all teams in a grid with live stats
- Auto-refreshes every 5 seconds
- Click any team card for detailed view (tap timeline, app usage pie chart, device vitals)

### Sort Teams
- Click sort buttons: Taps, Office Kit, Camera, Name

### Send Push Notifications to Devices
- Click **"Send Notification"** button in the dashboard header
- Fill in title + message
- Choose target audience:
  - **All devices** — broadcast to everyone
  - **Active only** — only devices currently sending data
  - **Idle only** — devices that haven't sent data recently
  - **Low taps** — devices below a tap threshold (e.g. teams not using the phone enough)
  - **High taps** — devices above a threshold
- Notifications arrive on phones within 30 seconds as mobile notifications

### Team Detail View
Click any team card to see:
- **Stats summary**: total taps, text inputs, scrolls, app switches
- **Tap Timeline**: bar chart showing taps per minute over time
- **App Usage**: pie chart showing time spent in each app
- **Device Vitals**: line chart with battery %, temperature °C, and RAM usage %

### Start/Stop Hackathon
- Dashboard → **Manage** → Start Hackathon / End Hackathon
- "End Hackathon" generates final reports for all teams

---

## PART 4: What Gets Tracked

| Data Point | How | Accuracy |
|---|---|---|
| Taps/clicks | AccessibilityService `TYPE_VIEW_CLICKED` | Good on standard Android views (Office Kit, Settings). Lower on custom-rendered apps (Instagram, Chrome) |
| Long presses | AccessibilityService `TYPE_VIEW_LONG_CLICKED` | Good |
| Scrolls | AccessibilityService `TYPE_VIEW_SCROLLED` | Very reliable across all apps |
| Text inputs | AccessibilityService `TYPE_VIEW_TEXT_CHANGED` | Counts events, NOT content |
| App switches | AccessibilityService `TYPE_WINDOW_STATE_CHANGED` | Very reliable |
| Current foreground app | Tracked per 60-second batch | Which app is active right now |
| Camera opens | Detected when camera package comes to foreground | Reliable |
| Clipboard events | ClipboardManager listener | Counts copies, NOT content |
| Notifications received | AccessibilityService `TYPE_NOTIFICATION_STATE_CHANGED` | Counts only |
| Battery level | BatteryManager | Exact % |
| Battery temperature | BatteryManager `EXTRA_TEMPERATURE` | Exact, in °C |
| RAM usage | ActivityManager `MemoryInfo` | Device-wide RAM %, accurate |
| App foreground time | Derived from event batches (1 batch ≈ 1 min) | Per-minute |

### Privacy
- **NO text content** is captured — only counts
- **NO screenshots** or photos
- **NO browsing history**
- **NO personal data** — just taps, scrolls, app names, and time
- Data is used solely for hackathon evaluation

---

## PART 5: Tamper Protection

| Protection | How it works |
|---|---|
| **Can't uninstall** | Device Admin activated — Android blocks uninstall silently |
| **Can't disable Accessibility** | Opening Accessibility Settings triggers passcode prompt |
| **Can't stop the app** | Foreground service with `START_STICKY` — restarts if killed |
| **Survives reboot** | Boot receiver restarts tracking service automatically |
| **Survives swipe from recents** | `onTaskRemoved` restarts the service |
| **Passcode on app open** | Opening the app while tracking requires organiser passcode |
| **Dangerous Settings gated** | Accessibility, Usage Access, Device Admin, App Info pages require passcode |

### Organiser Passcode Bypass
After entering the correct passcode, you get a time window to freely use Settings (e.g. to fix permissions). After the window expires, Settings access re-locks.

---

## PART 6: Data Sync & Offline Handling

| What | Interval | Offline Behavior |
|---|---|---|
| Event batches (taps, scrolls, etc.) | Every 60 seconds | Stored in local SQLite, synced when online |
| App usage snapshots | Every 5 minutes | Stored locally, synced when online |
| Heartbeat (status + battery + temp + RAM) | Every 30 seconds | Skipped if offline, resumes automatically |
| Data sync backup (WorkManager) | Every 15 minutes | Catches anything missed by foreground service |

If internet drops during the hackathon, no data is lost. Everything is stored locally and syncs when connectivity is restored.

---

## PART 7: After the Hackathon

1. Go to Dashboard → **Manage** → Click **"End Hackathon"**
2. Reports are generated for all teams automatically
3. View reports: click any team → full stats and charts
4. To retrieve phones: open HackTracker on each phone → enter passcode → tap **"Stop Tracking"**
5. To uninstall: Settings → Security → Device Admin → Deactivate HackTracker → then uninstall normally

---

## PART 8: Batch Device Setup Script (ADB)

For setting up many devices quickly via USB:

```bash
#!/bin/bash
# batch_setup.sh — Run with each phone connected via USB

APK_PATH="app-debug.apk"

# Install
adb install -r "$APK_PATH"

# Activate Device Admin (prevents uninstall)
adb shell dpm set-active-admin com.reskill.hacktracker/.receivers.HackTrackerAdminReceiver

echo "Done! Now manually on the phone:"
echo "1. Settings → Accessibility → HackTracker by Reskill → ON"
echo "2. Settings → Apps → Special Access → Usage Access → HackTracker → Allow"
echo "3. Open app → Configure hackathon ID, team ID, team name"
echo "4. Hit Save & Start Tracking"
```

Steps 1-2 (Accessibility + Usage Access) cannot be automated — Android requires manual user consent.

---

## PART 9: Troubleshooting

| Problem | Fix |
|---|---|
| Phone shows "offline" on dashboard | Open app → enter passcode. This restarts the foreground service. |
| Taps not updating | Verify Accessibility Service is ON: Settings → Accessibility → HackTracker |
| App Usage pie chart empty | Verify Usage Access granted: Settings → Apps → Special Access → Usage Access |
| Push notifications not showing on phone | Settings → Notifications → HackTracker → Allow + enable Heads-up/Banner |
| Battery drain | Expected: ~3-5% per hour. Exclude from battery optimization. |
| Can't install APK | Disable Play Protect temporarily, or install via `adb install` |
| Service keeps dying (Vivo/iQOO) | Settings → Battery → Background Power Management → Allow for HackTracker |
| Dashboard not updating | Check if the Railway deployment is running. Hard refresh the browser (Ctrl+Shift+R). |
| Settings not asking passcode | Accessibility Service may have been disabled/crashed. Re-enable it. |

---

## PART 10: Development (Local Setup)

For development or self-hosting:

### Web Dashboard
```bash
cd web
pnpm install
# Create web/.env.local with DATABASE_URL and JWT_SECRET
DATABASE_URL="your_neon_url" npx drizzle-kit push
pnpm dev
```

### Android App
```bash
cd android
# Requires Android Studio JDK or Java 17+
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew assembleDebug
# APK at: app/build/outputs/apk/debug/app-debug.apk
```

### Key Files
| File | Purpose |
|------|---------|
| `web/.env.local` | Database URL + JWT secret |
| `web/lib/db/schema.ts` | All database table definitions |
| `web/app/api/` | All REST API endpoints |
| `web/components/` | Dashboard UI components |
| `android/app/build.gradle.kts` | Android build config + API URL |
| `android/app/src/main/AndroidManifest.xml` | App permissions + services |
| `android/.../services/HackTrackerAccessibilityService.kt` | Core tracking engine |
| `android/.../services/TrackingForegroundService.kt` | Background service + sync |

### API Endpoints (for debugging)
```
GET  /api/hackathon/<id>/live          — Live data for all teams
GET  /api/team/<id>/timeline           — Minute-by-minute event batches
GET  /api/team/<id>/vitals             — Battery/temp/RAM history
POST /api/device/heartbeat             — Device status ping
POST /api/events/batch                 — Event data from device
POST /api/device/register              — Auto-register team from phone
POST /api/hackathon/<id>/notify        — Send push notification
```
