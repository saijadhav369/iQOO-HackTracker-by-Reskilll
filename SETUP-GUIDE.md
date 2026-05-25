ight# HackTracker by Reskill — Complete Setup Guide

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

5. **Display over other apps** (for the Red Light venue cue):
   - Will be prompted on first launch of the setup screen — tap **Allow**
   - If missed: Settings → Apps → Special Access → Display over other apps → HackTracker → **Allow**

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
- A red **⚠** badge on a team card means unresolved **tamper events** were detected on that device — click it to jump straight to the team's Tamper tab

### Sort Teams
- Click sort buttons: Taps, Office Kit, Camera, Name

### Leaderboard (Composite Build Score)
- Dashboard header → **Leaderboard** button opens `/dashboard/<id>/leaderboard`.
- Four views: **Build Score** (composite, default), **Most Active** (typing density), **Most Office Kit** (raw Office Kit minutes), **Most Resilient** (fewest crashes + idle warnings).
- The composite rewards how hard the iQOO hardware is pushed. Seven positive contributors (weights sum to 1.00) plus two penalties:
  | Contributor | Weight | Source |
  |---|---|---|
  | Office Kit minutes | 0.30 | accessibility-timed dwell in the Office Kit window (`event_batches.office_kit_seconds`) |
  | Compile spikes | 0.15 | count of >50-point jumps in the device usage signal between vitals samples |
  | Typing density | 0.15 | `text_inputs` + `keyboard_active_seconds` (MotionEvent velocity isn't available, so this is a proxy) |
  | Battery drain rate | 0.10 | % battery drained per observed hour |
  | Thermal headroom | 0.10 | max `getThermalHeadroom()` (higher = closer to throttle = more intense) |
  | Hardware redline | 0.10 | count of samples at `getCurrentThermalStatus()` ≥ SEVERE |
  | Performance mode minutes | 0.10 | distinct minutes iQOO game/performance mode (`is_game_mode`) was on |
  | Crash count | −0.10 | `crash_logs` (raw count × weight) |
  | Idle warnings | −0.10 | `organiser_alerts` type `idle_warning` (raw) |
- Click any row to expand the contributor math. `—` in the Norm column means every team posted the same value, so that contributor doesn't affect ranking (needs ≥2 differing teams). The displayed score is floored at 0; the breakdown shows the raw sum.
- Server caches results for 30s; the page polls every 30s.

#### Calibrating the hardware signals on real iQOO units (do this once per ROM)
Both ROM-specific signals were calibrated on the test unit (vivo/iQOO OriginOS). Re-verify if you deploy on a different ROM.
1. **Office Kit window class** — the app times the Office Kit screen by matching the accessibility window class name. On the test unit, opening Office Kit surfaces **vivo PC Suite** (`com.vivo.pcsuite.activity.DeviceListActivity`), so `pcsuite` is in the default `OFFICE_KIT_CLASS_PATTERNS`. Re-confirm per ROM (open Office Kit, then):
   ```bash
   adb shell "dumpsys activity activities | grep -i resumed"
   ```
   Add any new class substring to `OFFICE_KIT_CLASS_PATTERNS` in `android/.../util/Constants.kt` and rebuild.
2. **Performance mode** — iQOO "Monster Mode" has **no global Settings key** (it's a per-game Game Cube toggle). The app instead polls the real game/performance-mode flags (`is_game_mode`, `game_plus_mode_key`, `bench_mark_mode`) in `PERFORMANCE_MODE_SETTING_KEYS`. Verify what your ROM exposes:
   ```bash
   adb shell settings list system | grep -i mode
   adb shell settings list global | grep -i mode
   ```
   Toggle iQOO performance/game mode and watch which key flips to 1; add it to `PERFORMANCE_MODE_SETTING_KEYS`. Until a key reads non-zero, "Performance mode minutes" stays 0 and the contributor simply doesn't affect ranking.

- **Per-hackathon weight overrides** (no UI yet — direct SQL): set the `scoring_config` JSON on the `hackathons` row. Example:
  ```sql
  UPDATE hackathons SET scoring_config = jsonb_build_object(
    'weights', jsonb_build_object('officeKitMinutes', 0.40, 'thermalHeadroom', 0.05)
  ) WHERE id = 'your_hackathon_id';
  ```
  Weight keys: `officeKitMinutes`, `compileSpikes`, `typingDensity`, `batteryDrainRate`, `thermalHeadroom`, `hardwareRedline`, `monsterModeMinutes`, `crashCount`, `idleWarningCount`.

### Red/Green Light (Venue Signal)
- Big pill in the dashboard header shows the current venue light. Click it to switch.
- **Green** (default): phones show the standard notification — normal operating state.
- **Red**: every paired phone draws a thin red strip across the very top of the screen and switches its persistent notification to red. This is a **visible cue only** — participants can still use the phone, type, switch apps, etc.
- Each switch writes a row in `light_transitions` so you can see when and how often it flipped.
- A confirmation modal appears before switching; the new state propagates to phones within one heartbeat (~30s).
- Per-phone requirement: the **Display over other apps** permission. The setup screen prompts for it on first run; if a phone misses it, grant it manually at Settings → Apps → Special Access → Display over other apps → HackTracker.

### Idle Warnings During Red Light
- While the venue light is **Red**, the dashboard pings the idle scanner once a minute.
- A team is flagged "idle" if its phone heartbeat is still fresh (<60s) AND zero taps were recorded in the last 10 minutes.
- Flagged teams get an automatic push notification on the phone ("Idle during Red light — Pick up the phone.") delivered via the normal heartbeat-pull (within ~30s).
- The dashboard shows an alert chip in the top-right tray and the team card flashes a yellow border. Click the alert to jump to the team detail; tap the X to dismiss.
- Dedupe: the same team won't be re-alerted more than once every 10 minutes.
- The dashboard tab must stay open for the scanner to run (Railway has no cron). On Vercel this would move to Vercel Cron.

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
Click any team card to open its detail page. It's organised into tabs — **Overview**, **Screenshots**, **Crash log**, and **Tamper** (each tab shows a count when it has entries).

**Overview** tab:
- **Stats summary**: total taps, text inputs, scrolls, app switches
- **Tap Timeline**: bar chart showing taps per minute over time
- **App Usage**: pie chart showing time spent in each app
- **Device Vitals**: composite chart with battery %, temperature °C, free RAM (MB), a colour-banded thermal-status timeline (none→shutdown), and amber bolt ticks marking when the device was on charge. Hover any point for charging source and network type (wifi/cellular/vpn).

**Tamper** tab (also reachable from the red ⚠ badge on the team card): a chronological list of tamper signals — Settings page opens, ADB toggles, clock drift, safe-mode boots, and unexpected package installs/removals — each with its type, timestamp, and per-event detail.

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
| Free / total RAM | ActivityManager `MemoryInfo` | Available + total RAM in MB |
| Charging state | BatteryManager `EXTRA_STATUS` / `EXTRA_PLUGGED` | On-charge flag + source (ac/usb/wireless/none) |
| Thermal status | PowerManager `getCurrentThermalStatus()` | 0=none … 6=shutdown (4=critical) |
| Network type | ConnectivityManager transport | wifi / cellular / vpn / none |
| Cellular signal | TelephonyManager signal strength | dBm, best-effort (null off-cellular) |
| Wi-Fi signal | WifiManager RSSI | dBm, best-effort |
| Data since boot | TrafficStats total Rx/Tx | Cumulative MB received + transmitted |
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
| **Dangerous Settings gated** | Accessibility, Usage Access, Device Admin, App Info pages require passcode — matched by **both** the activity class name **and** the visible page heading, so an OEM-renamed (OriginOS) Settings page is still caught |

### Tamper Monitoring (logged to the dashboard)
Beyond blocking, the app now records tamper *signals* and ships them to the dashboard so organisers can see attempts after the fact. Each lands within ~60 seconds:

| Signal | What triggers it |
|---|---|
| **Settings page opened** | A gated Settings page (by class name or heading) was reached outside the passcode window |
| **ADB toggled** | `Settings.Global.ADB_ENABLED` changed (USB / wireless debugging turned on or off) |
| **Clock drift** | Wall-clock and monotonic time diverged by >5s between batches — a manual date/time change |
| **Safe-mode boot** | The phone was booted into Safe Mode (where third-party services are disabled) |
| **Package installed / removed** | An unexpected app was installed or uninstalled during the hackathon (app updates and HackTracker itself are ignored) |

Events surface as a red **⚠** badge on the team card (count of unresolved events). Click the badge — or the team card's **Tamper** tab — to see the full list with per-event detail.

### Device-Owner Hardening (when provisioned as device-owner)
If the phone was provisioned as **device-owner** (via ADB during setup), two extra protections activate automatically and **silently no-op** on non-device-owner units:
- **Status bar disabled on Red light** — the quick-settings shade and notification pull-down are blocked while the venue light is Red, and restored on Green.
- **Lock-task whitelist** — HackTracker is whitelisted for kiosk (lock-task) mode around sensitive operations such as screenshot capture.

Safe Mode is also latched: if the phone is booted into Safe Mode, the passcode screen **refuses to unlock** until the organiser reboots the device back to a normal boot.

### Organiser Passcode Bypass
After entering the correct passcode, you get a time window to freely use Settings (e.g. to fix permissions). After the window expires, Settings access re-locks.

---

## PART 6: Data Sync & Offline Handling

| What | Interval | Offline Behavior |
|---|---|---|
| Event batches (taps, scrolls, etc.) | Every 60 seconds | Stored in local SQLite, synced when online |
| App usage snapshots | Every 5 minutes | Stored locally, synced when online |
| Heartbeat (status + battery + temp + RAM + charging + thermal + network + signal + data) | Every 30 seconds | Skipped if offline, resumes automatically |
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

## PART 8: Fleet Provisioning — one command per phone (no manual tapping)

**You provision each phone once; settings persist across reboots** (a `BOOT_COMPLETED`
receiver restarts tracking automatically). You do NOT re-configure after a restart.

There are **three ways** to provision — pick per your situation:

| Method | Cable? | APK hosting? | Fully hands-off? | Best when |
|---|---|---|---|---|
| **A. ADB script** | ✅ yes | ❌ no | ✅ **yes** (all perms + config) | you can plug each phone in — *recommended* |
| **B. QR (device-owner)** | ❌ no | ✅ required | ⚠️ almost (Accessibility + Usage still need 1 step) | many phones, no time to cable each |
| **C. Manual** | ❌ no | ❌ no | ❌ no (tap everything) | a one-off phone / no PC handy |

---

### Method A — ADB script (recommended, fully automated)
`android/provision.ps1` (Windows) or `android/provision.sh` (macOS/Linux) does the whole
thing in one command — install, **all** permissions, device-owner, config, start.

Connect a phone via USB and run:

```powershell
cd android
.\provision.ps1 -TeamId team_01 -TeamName "CodeCrafters" `
                -ApiUrl https://your-app.up.railway.app/api `
                -HackathonId iqoo_2026 -Passcode 123456 -SetDeviceOwner
```

Repeat per phone, changing only `-TeamId`/`-TeamName`. Drop `-SetDeviceOwner` if the
phone already has accounts (device-owner needs a freshly-reset phone with none).

### What it runs (the manual equivalent)
```bash
PKG=com.reskill.hacktracker
adb install -r app-debug.apk

# Accessibility (taps, Office-Kit timing, screenshots) — appends, doesn't clobber
adb shell settings put secure enabled_accessibility_services \
  $PKG/$PKG.services.HackTrackerAccessibilityService
adb shell settings put secure accessibility_enabled 1

# Usage Access (app-usage minutes) + Overlay (red-light strip)
adb shell appops set $PKG GET_USAGE_STATS allow
adb shell appops set $PKG SYSTEM_ALERT_WINDOW allow

# Notifications + battery-optimization exemption (survives iQOO killing)
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS
adb shell dumpsys deviceidle whitelist +$PKG

# Anti-uninstall (active-admin) OR full device-owner on a fresh phone
adb shell dpm set-device-owner $PKG/$PKG.receivers.HackTrackerAdminReceiver

# Configure + start tracking — no on-screen typing
adb shell am start -n $PKG/$PKG.ui.SetupActivity \
  --es cfg_api_url https://your-app.up.railway.app/api \
  --es cfg_hackathon_id iqoo_2026 --es cfg_team_id team_01 \
  --es cfg_team_name "CodeCrafters" --es cfg_passcode 123456
```

> **Correction to older guidance:** Accessibility and Usage Access *can* be granted
> headlessly over ADB (shown above) — `adb shell` holds `WRITE_SECURE_SETTINGS`, which
> the app itself does not. So no manual taps are required when provisioning via ADB.

### iQOO/Vivo extra (do once per phone)
OriginOS aggressively kills background apps. After provisioning, enable **Auto-start**
and **Battery → Background power consumption → Allow** for HackTracker, or provision as
**device-owner** (which exempts it). Without this, the phone may not restart tracking
after a reboot.

### Method B — QR (no cable, device-owner)
For provisioning without a USB cable, HackTracker supports Android's device-owner QR flow.
The app's `HackTrackerAdminReceiver.onProfileProvisioningComplete` reads the embedded
config, grants notifications, and auto-starts tracking.

**Hosting the APK (required for QR):** the web app already serves the APK at
`https://<your-app>.up.railway.app/app-debug.apk` (the file lives in `web/public/`).
Re-copy it after each Android build: `cp android/app/build/outputs/apk/debug/app-debug.apk web/public/`
and redeploy. Point the QR's `APK_URL` at that URL.

**Generate the QR:**
```powershell
cd android
# point it at your prod APK URL + dashboard, and your venue Wi-Fi:
$env:APK_URL="https://<host>/app-debug.apk"; $env:API_URL="https://<app>.up.railway.app/api"
$env:HACKATHON_ID="iqoo_2026"; $env:TEAM_ID="team_01"; $env:TEAM_NAME="CodeCrafters"; $env:PASSCODE="123456"
$env:WIFI_SSID="VenueWifi"; $env:WIFI_PASS="wifipass"
npm i qrcode      # one-time, for PNG rendering
node tools/make-provisioning-qr.mjs   # → provisioning-qr.png
```
The script also prints the **signing-cert checksum** (recompute for a release APK with
`apksigner verify --print-certs app-release.apk`). The APK must be hosted at a public
HTTPS `APK_URL` so the phone can download it during setup.

**Per phone:** factory-reset → on the first "Welcome" screen tap **6 times** → scan the QR.
The phone joins Wi-Fi, downloads + installs the APK as device-owner, and self-configures.

**The one limitation:** Android forbids an app (even device-owner) from enabling its own
**Accessibility** and **Usage Access** — those need `WRITE_SECURE_SETTINGS`, which only
`adb shell` holds. So after the QR, each phone still needs Accessibility + Usage Access
granted, via either a quick `adb` (the two `settings put` / `appops` lines from above) or
a manual tap. **The fully-hands-off path remains the `provision.ps1` ADB script** — QR is
best when you can't cable each phone and don't mind that one residual step.

### Method C — Manual provisioning (tap-by-tap, no PC)
Use this for a one-off phone with no computer handy. Do these on the phone in order; each
permission is a separate Android screen.

1. **Install the APK.** Transfer `app-debug.apk` (USB copy, Drive, Telegram) → tap → Install.
   If Play Protect blocks it: Play Protect → disable scan temporarily, or "Install anyway".
2. **Accessibility** (taps, Office-Kit timing, screenshots):
   Settings → Accessibility → Downloaded apps → **HackTracker by Reskill** → toggle **ON** → confirm.
3. **Usage Access** (app-usage minutes):
   Settings → Apps → Special access → **Usage access** → HackTracker → **Allow**.
4. **Display over other apps** (red-light strip):
   Settings → Apps → Special access → **Display over other apps** → HackTracker → **Allow**.
5. **Notifications:** Settings → Notifications → HackTracker → **Allow** (enable Banners/Heads-up).
6. **Battery:** Settings → Battery → Battery optimization → HackTracker → **Don't optimize**.
   On iQOO/Vivo also: Settings → Battery → **Background power consumption** → HackTracker → **Allow**,
   and enable **Auto-start** — without these the app won't restart after a reboot.
7. **Open HackTracker** and fill the Setup screen:
   API URL = `https://<your-app>.up.railway.app/api`, Hackathon ID, Team ID (unique per phone),
   Team Name, Passcode (≥6 digits). Tap **Save & Start Tracking**.
8. When prompted, **Activate Device Admin** (blocks uninstall).

The team appears on the dashboard within ~60s, status dot green. This is the same end
state as the ADB/QR methods — just done by hand.

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
# Apply any SQL migrations under web/lib/db/migrations/ in order
# (e.g. 0001_light.sql … 0011_tamper.sql) — these add columns/tables the
# Drizzle schema relies on. Run them against the same DATABASE_URL via psql or
# the Neon console. (The tamper_events table arrives in 0011_tamper.sql; it is
# idempotent, so `drizzle-kit push` above will also create it.)
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
GET  /api/team/<id>/vitals             — Battery/temp/RAM/charging/thermal/network history
POST /api/device/heartbeat             — Device status ping
POST /api/events/batch                 — Event data from device
POST /api/device/register              — Auto-register team from phone
POST /api/hackathon/<id>/notify        — Send push notification
POST /api/hackathon/<id>/scan-idle     — Idle-during-Red-light scanner (polled from dashboard every 60s)
GET  /api/organiser-alerts?hackathonId=<id>  — Undismissed organiser alerts for the tray
PATCH /api/organiser-alerts/<id>       — Dismiss an organiser alert
POST /api/tamper                       — Batched tamper events from the device
GET  /api/team/<id>/tamper             — Tamper events for the team detail Tamper tab
```

---

## PART 11: Deploying the Dashboard on Railway

Deployment is driven by the **`Dockerfile` at the repo root** — Railway auto-detects it,
copies `web/`, runs `pnpm install` + `pnpm build`, and serves with `pnpm start`. There is
no `railway.json`/`toml`; the Dockerfile *is* the config.

### 1. Create the service
1. Railway → **New Project → Deploy from GitHub repo** → pick this repo.
2. **Leave Root Directory at the repo root** (do NOT set it to `web`) — the root
   `Dockerfile` references `web/` itself. Railway uses the Dockerfile automatically.
3. Don't set custom build/start commands — the Dockerfile defines them.
4. `DATABASE_URL` must be available at **build time** (the Dockerfile validates the schema
   during `pnpm build`). Railway passes service variables to the build, so just set it in
   Variables (next step). Railway provides `$PORT` automatically.

> The Dockerfile ships `web/public/app-debug.apk` (for QR provisioning) — `.dockerignore`
> ignores `*.apk` but explicitly re-includes that one file. The `assembleDebug` Gradle
> task keeps it fresh; commit it (or re-copy) before deploying.

### 2. Environment variables (Railway → Variables)
| Variable | Value |
|---|---|
| `DATABASE_URL` | your Neon connection string (`postgresql://…?sslmode=require`) |
| `JWT_SECRET` | a long random string (organiser login signing key) |
| `S3_BUCKET` | screenshot bucket name (see PART 12) |
| `S3_REGION` | e.g. `ap-south-1` |
| `S3_ACCESS_KEY_ID` | **permanent** IAM key (`AKIA…`) |
| `S3_SECRET_ACCESS_KEY` | the IAM secret |
| `S3_ENDPOINT` | leave **unset** for AWS; set only for R2/MinIO |
| `CRON_SECRET` | random string; the idle-scan cron must send it (PART 11 cron section) |

> Use a **permanent** IAM key on Railway. Temporary STS creds (`ASIA…` + session token)
> expire in hours and will break screenshot loading.

### 3. Run the database migrations (once)
Apply every file in `web/lib/db/migrations/` in numeric order against the prod Neon DB
(Neon SQL editor or psql). They are idempotent (`IF NOT EXISTS` guards), e.g.:
```bash
for f in web/lib/db/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```
Or `pnpm drizzle-kit push` from `web/` with `DATABASE_URL` set.

### 4. Point the phones at Railway
In provisioning (PART 8), set `-ApiUrl https://<your-app>.up.railway.app/api`. Phones
auto-register; teams appear on the dashboard within ~60s.

### Railway caveats
- **Screenshots require S3** — Railway's `/tmp` is wiped on every redeploy/restart, so
  without S3 (PART 12) captures are lost. With S3 configured they persist.
- **Idle-warning scan** — by default it runs only while an organiser has the dashboard
  tab open. For unattended scanning, set up the Railway Cron below.

### Railway Cron — unattended idle scanning
`GET/POST /api/cron/scan-idle` sweeps **every active red-light hackathon** in one call
(no per-id loop). Wire it to a schedule:

1. **Set a secret:** add `CRON_SECRET=<random-string>` to the web service's Railway
   Variables (and to local `.env`). When set, the endpoint requires it; when blank, it's
   open (dev only).
2. **Add a Cron service:** Railway → **New → Cron** (or a separate service with a Cron
   schedule). Schedule `* * * * *` (every minute) running:
   ```bash
   curl -fsS -H "x-cron-secret: $CRON_SECRET" https://<your-app>.up.railway.app/api/cron/scan-idle
   ```
   (Or `Authorization: Bearer $CRON_SECRET` — both headers are accepted.)
3. Now idle warnings fire even with no dashboard open. Returns
   `{ hackathons, scanned, alerted }` per run.

---

## PART 12: AWS S3 Setup (screenshot storage)

Screenshots are uploaded to S3 and served back through `/api/screenshots/[id]/raw`, so
the **bucket can stay private** (no public access needed).

### 1. Create the bucket
- S3 → **Create bucket** → name it (e.g. `hacktracker`), pick a region (e.g. `ap-south-1`).
- Keep **Block all public access = ON** (private is fine — the app streams images).

### 2. Create an IAM user with least-privilege access
- IAM → **Users → Create user** (programmatic access).
- Attach an inline policy scoped to the bucket:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
    "Resource": "arn:aws:s3:::hacktracker/screenshots/*"
  }]
}
```
- Create an **access key** → you get `AWS_ACCESS_KEY_ID` (`AKIA…`) + `AWS_SECRET_ACCESS_KEY`.

### 3. Wire it up
Set in `web/.env` (local) **and** Railway Variables:
```
S3_BUCKET=hacktracker
S3_REGION=ap-south-1
S3_ACCESS_KEY_ID=AKIA...
S3_SECRET_ACCESS_KEY=...
# S3_SESSION_TOKEN=   ← only for temporary STS creds (ASIA…); omit for permanent keys
# S3_ENDPOINT=        ← only for S3-compatible providers (see below)
```
No code change needed — when these are present the app stores/serves via S3; when absent
it falls back to ephemeral `/tmp` (dev only).

### S3-compatible alternatives (cheaper, same code)
Set `S3_ENDPOINT` to use Cloudflare R2, MinIO, or Backblaze B2 instead of AWS:
- **Cloudflare R2:** `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`, `S3_REGION=auto`, and R2 API token's access key/secret. No egress fees.
- The client auto-switches to path-style addressing when `S3_ENDPOINT` is set.

### Verify
Capture a screenshot from a phone (or via the dashboard request button); the object
appears under `screenshots/` in the bucket and renders on the team's **Screenshots** tab.
