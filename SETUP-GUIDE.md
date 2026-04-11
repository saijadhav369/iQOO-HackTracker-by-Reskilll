# HackTracker by Reskill — Complete Setup Guide

## What This Is

HackTracker is a hackathon device tracking system with two parts:
1. **Android App** — Runs silently on hackathon devices, tracks taps, app usage, camera opens, and syncs data to a backend
2. **Web Dashboard** — Organisers see real-time usage data for every team's device, send notifications, and generate reports

---

## System Requirements

### Web Dashboard (Organiser's Laptop)
- Node.js 18+
- A Neon PostgreSQL database (free tier works)
- Browser (any modern browser)

### Android Devices (Participant Phones)
- Android 8+ (API 26+)
- WiFi connectivity (same network as the server, or server deployed to cloud)

---

## PART 1: Web Dashboard Setup (One-Time)

### 1.1 Install & Configure

```bash
cd "/Users/sameerkatte/Desktop/iqoo hackathon tracker/web"
pnpm install
```

### 1.2 Set Environment Variables

Edit `web/.env.local`:
```
DATABASE_URL=postgresql://neondb_owner:YOUR_PASSWORD@YOUR_HOST.neon.tech/neondb?sslmode=require
JWT_SECRET=any-random-string-at-least-32-chars
```

### 1.3 Push Database Schema

```bash
cd web
DATABASE_URL="your_neon_url_here" npx drizzle-kit push
```

### 1.4 Start the Server

```bash
cd web
pnpm dev
```

Server runs on `http://localhost:3000` (or next available port like 3001).

Note your machine's local IP for the phones:
```bash
ipconfig getifaddr en0
```

### 1.5 Create a Hackathon

1. Open `http://localhost:3000` in browser
2. Click **"Create Hackathon"** tab
3. Fill in:
   - **Hackathon ID**: e.g. `iqoo_mumbai_2026` (lowercase, no spaces — this goes on every phone)
   - **Hackathon Name**: e.g. `iQOO Mumbai Hackathon 2026`
   - **Start Time**: When the hackathon begins
   - **End Time**: When it ends
   - **Organiser Passcode**: 6+ digit code (used on phones AND to login to dashboard)
4. Click **"Create & Enter Dashboard"**

You're now in the live dashboard. Keep this open during the hackathon.

---

## PART 2: Android App Build (One-Time)

### 2.1 Build the APK

**Option A — Command Line (if SSL/network is working):**
```bash
cd "/Users/sameerkatte/Desktop/iqoo hackathon tracker/android"
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew assembleDebug
```

APK output: `android/app/build/outputs/apk/debug/app-debug.apk`

**Option B — Android Studio:**
1. Open `/Users/sameerkatte/Desktop/iqoo hackathon tracker/android/` in Android Studio
2. Wait for Gradle sync
3. Build → Build Bundle(s) / APK(s) → Build APK(s)

### 2.2 SSL Issues (Corporate Network)

If Gradle can't download dependencies due to SSL/proxy:
- The project includes an SSL bypass in `settings.gradle.kts`
- Custom truststore at `/tmp/cacerts_custom` is configured in `gradle.properties`
- If still failing, build from a non-corporate network (hotspot)

---

## PART 3: Per-Device Setup (Before Handout)

**Time per device: ~3 minutes**
**30 devices = ~90 minutes**

Do this for EACH hackathon phone before giving to participants:

### Step 1: Install the App

**Via USB + ADB (fastest for batch setup):**
```bash
# Connect phone via USB, enable USB Debugging on phone
adb install app-debug.apk
```

**Via file transfer:**
- Send `app-debug.apk` to phone (Telegram, email, USB copy)
- Open on phone → Install
- If Google Play Protect blocks: Settings → Play Store → Play Protect → Gear icon → Turn OFF "Scan apps" → Install → Turn back ON

### Step 2: Grant Permissions

These MUST be done manually — Android requires user consent:

1. **Accessibility Service** (required — this is what tracks taps/scrolls):
   - Settings → Accessibility → Downloaded apps/services → **HackTracker by Reskill** → Turn **ON**
   - Confirm any warning dialogs

2. **Usage Access** (required — tracks which apps are used and for how long):
   - Settings → Apps → Special Access → Usage Access → **HackTracker by Reskill** → **Allow**

3. **Notification Permission** (required — for persistent tracking notification + push notifications):
   - Will be prompted when app starts — tap **Allow**
   - If missed: Settings → Notifications → HackTracker by Reskill → Allow

4. **Battery Optimization** (recommended — prevents Android from killing the service):
   - Settings → Battery → Battery Optimization → HackTracker → **Don't Optimize**
   - On Vivo/iQOO: also go to Settings → Battery → Background Power Consumption Management → HackTracker → Allow

### Step 3: Configure the App

Open HackTracker. Fill in the Setup screen:

| Field | What to enter |
|-------|---------------|
| **API URL** | `http://<your-laptop-ip>:<port>/api` e.g. `http://192.168.50.75:3001/api` |
| **Hackathon ID** | Same ID you created in the dashboard, e.g. `iqoo_mumbai_2026` |
| **Team ID** | Unique per phone, e.g. `team_01`, `team_02`, ... `team_30` |
| **Team Name** | The team's name, e.g. `CodeCrafters` |
| **Passcode** | Same organiser passcode you set when creating the hackathon |

Hit **"Save & Start Tracking"**

A popup asks to activate **Device Admin** — tap **Activate**. This prevents participants from uninstalling the app.

### Step 4: Verify

- Persistent notification appears: "HackTracker by Reskill — Tracking your build session"
- Status shows "TRACKING" with tap counter incrementing
- On the dashboard, the team appears in the grid within 60 seconds
- Status dot turns green (active)

### Step 5: Lock & Hand Out

- Press home to leave the app
- The app continues tracking in the background
- Hand the phone to the participant

---

## PART 4: During the Hackathon (Organiser Actions)

### Live Dashboard
- URL: `http://localhost:3000/dashboard/<hackathon_id>`
- Shows all teams in a grid with live stats
- Auto-refreshes every 5 seconds
- Click any team card for detailed view (tap timeline, app usage pie, device vitals)

### Sort Teams
- Click sort buttons: Taps, Office Kit, Camera, Name

### Send Notifications to Devices
- Click **"Send Notification"** button in dashboard header
- Choose target audience:
  - **All devices** — broadcast to everyone
  - **Active only** — only devices currently sending data
  - **Idle only** — devices that haven't sent data recently
  - **Low taps** — devices below a tap threshold (e.g. teams not using the phone enough)
  - **High taps** — devices above a threshold
- Notifications arrive on phones within 30 seconds

### Start/Stop Hackathon
- Dashboard → **Manage** → Start Hackathon / End Hackathon
- "End Hackathon" generates final reports for all teams

### Add Teams Manually (Optional)
- Dashboard → **Manage** → Add Team form
- Not needed if phones auto-register (which they do by default)

---

## PART 5: What Gets Tracked

| Data Point | Method | Accuracy |
|---|---|---|
| Taps/clicks | AccessibilityService `TYPE_VIEW_CLICKED` | Good on standard Android views (Office Kit, Settings). Lower on custom-rendered apps (Instagram, Chrome) |
| Long presses | AccessibilityService `TYPE_VIEW_LONG_CLICKED` | Good |
| Scrolls | AccessibilityService `TYPE_VIEW_SCROLLED` | Very reliable across all apps |
| Text inputs | AccessibilityService `TYPE_VIEW_TEXT_CHANGED` | Counts events, NOT content |
| App switches | AccessibilityService `TYPE_WINDOW_STATE_CHANGED` | Very reliable |
| Foreground app | Tracked per 60-second batch | Which app is active right now |
| Camera opens | Detected when camera package comes to foreground | Reliable |
| Clipboard events | ClipboardManager listener | Counts copies, NOT content |
| Notifications received | AccessibilityService `TYPE_NOTIFICATION_STATE_CHANGED` | Counts only |
| Battery level | BatteryManager | Exact |
| Battery temperature | BatteryManager `EXTRA_TEMPERATURE` | Exact, in °C |
| CPU usage | /proc/stat sampling | Approximate |
| App foreground time | Derived from event batches (1 batch ≈ 1 min) | Per-minute |

### Privacy
- **NO text content** is captured — only counts
- **NO screenshots** or photos are captured
- **NO browsing history** is captured
- **NO personal data** — just taps, scrolls, app names, and time
- Data is used solely for hackathon evaluation

---

## PART 6: Tamper Protection

| Protection | How it works |
|---|---|
| **Can't uninstall** | Device Admin activated — Android blocks uninstall. Participant sees popup but nothing happens |
| **Can't disable Accessibility** | Opening Accessibility Settings triggers passcode prompt |
| **Can't stop the app** | Foreground service with `START_STICKY` — restarts if killed |
| **Survives reboot** | Boot receiver restarts tracking service |
| **Survives swipe from recents** | `onTaskRemoved` restarts the service |
| **Passcode on app open** | Opening the app while tracking requires organiser passcode |
| **Settings gated** | Accessibility, Usage Access, Device Admin, App Info pages in Settings require passcode |

### Organiser Passcode Bypass
After entering the correct passcode, you get a **5-minute window** to freely use Settings (e.g. to fix permissions). After 5 minutes, Settings access re-locks.

---

## PART 7: Data Sync & Offline Handling

| What | Interval | Offline Behavior |
|---|---|---|
| Event batches (taps, scrolls, etc.) | Every 60 seconds | Stored in local SQLite, synced when online |
| App usage snapshots | Every 5 minutes | Stored locally, synced when online |
| Heartbeat (status + battery + temp) | Every 30 seconds | Skipped if offline, resumes automatically |
| Data sync backup (WorkManager) | Every 15 minutes | Catches anything missed by foreground service |

If WiFi drops during the hackathon, no data is lost. Everything is stored locally and syncs when connectivity is restored.

---

## PART 8: After the Hackathon

1. Go to Dashboard → **Manage** → Click **"End Hackathon"**
2. Reports are generated for all teams automatically
3. View reports: click any team → full report with summary stats
4. To retrieve phones: open HackTracker on each phone → enter passcode → tap **"Stop Tracking"**
5. To uninstall: Settings → Security → Device Admin → Deactivate HackTracker → then uninstall normally

---

## PART 9: Batch Setup Script (for 30+ devices)

If setting up many devices via ADB:

```bash
#!/bin/bash
# batch_setup.sh — Run with phone connected via USB

APK_PATH="app-debug.apk"
HACKATHON_ID="iqoo_mumbai_2026"

# Install
adb install -r "$APK_PATH"

# Activate Device Admin
adb shell dpm set-active-admin com.reskill.hacktracker/.receivers.HackTrackerAdminReceiver

echo "Done! Now manually:"
echo "1. Enable Accessibility Service"
echo "2. Enable Usage Access"
echo "3. Open app → Configure team ID, name, API URL"
```

Steps 1-2 (Accessibility + Usage Access) cannot be automated — Android requires manual user consent for these permissions.

---

## PART 10: Troubleshooting

| Problem | Fix |
|---|---|
| Phone shows "offline" on dashboard | Open app → enter passcode. This restarts the foreground service. Check WiFi connection. |
| Taps not updating | Verify Accessibility Service is ON (Settings → Accessibility → HackTracker) |
| App Usage empty | Verify Usage Access is granted (Settings → Apps → Special Access → Usage Access) |
| Notifications not showing | Settings → Notifications → HackTracker → Allow + enable Heads-up/Banner |
| Battery drain | Expected: ~3-5% per hour. Exclude from battery optimization. |
| Dashboard slow | Check if server is running. Restart with `pnpm dev` |
| Can't install APK | Disable Play Protect temporarily, or install via `adb install` |
| Service keeps dying | On Vivo/iQOO: Settings → Battery → Background Power Management → Allow for HackTracker |
| API URL wrong | Must include `/api` at the end, e.g. `http://192.168.50.75:3001/api` |
| WiFi changed | If laptop IP changes, you need to reconfigure each phone's API URL |

---

## Quick Reference

### Dashboard URLs
- **Login**: `http://<server>:<port>/login`
- **Live Dashboard**: `http://<server>:<port>/dashboard/<hackathon_id>`
- **Team Detail**: `http://<server>:<port>/dashboard/<hackathon_id>/team/<team_id>`
- **Manage**: `http://<server>:<port>/dashboard/<hackathon_id>/manage`

### API Endpoints (for debugging)
- `GET /api/hackathon/<id>/live` — Live data for all teams
- `GET /api/team/<id>/timeline` — Minute-by-minute event batches
- `GET /api/team/<id>/vitals` — Battery/temp/CPU history
- `POST /api/device/heartbeat` — Device status ping

### Key Files
- **APK**: `android/app/build/outputs/apk/debug/app-debug.apk`
- **Web config**: `web/.env.local`
- **DB schema**: `web/lib/db/schema.ts`
- **Android manifest**: `android/app/src/main/AndroidManifest.xml`
