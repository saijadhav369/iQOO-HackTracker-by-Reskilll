#!/usr/bin/env bash
# HackTracker fleet provisioning (macOS/Linux) — one command per phone, fully scripted.
# Does install + ALL permissions + device-owner + config + start over ADB, so
# there is no manual tapping. Settings persist across reboots (provision once).
#
# Usage (one phone connected via USB):
#   ./provision.sh team_01 "CodeCrafters" https://your-app.up.railway.app/api iqoo_2026 123456
# Args:  TEAM_ID  TEAM_NAME  API_URL  HACKATHON_ID  PASSCODE  [APK_PATH]  [--device-owner]
set -euo pipefail

TEAM_ID="${1:?team_id required}"
TEAM_NAME="${2:?team_name required}"
API_URL="${3:?api_url required}"
HACKATHON_ID="${4:?hackathon_id required}"
PASSCODE="${5:?passcode required}"
APK_PATH="${6:-$(dirname "$0")/app/build/outputs/apk/debug/app-debug.apk}"
SET_DO="${7:-}"

PKG=com.reskill.hacktracker
ACC="$PKG/$PKG.services.HackTrackerAccessibilityService"
ADMIN="$PKG/$PKG.receivers.HackTrackerAdminReceiver"
SETUP="$PKG/$PKG.ui.SetupActivity"

echo "== waiting for device =="; adb wait-for-device
echo "== install =="; adb install -r "$APK_PATH"

echo "== accessibility (append, don't clobber) =="
CUR="$(adb shell settings get secure enabled_accessibility_services | tr -d '\r')"
if [ "$CUR" = "null" ] || [ -z "$CUR" ]; then NEW="$ACC"
elif printf '%s' "$CUR" | grep -q "$ACC"; then NEW="$CUR"
else NEW="$CUR:$ACC"; fi
adb shell settings put secure enabled_accessibility_services "$NEW"
adb shell settings put secure accessibility_enabled 1

echo "== usage access + overlay =="
adb shell appops set $PKG GET_USAGE_STATS allow
adb shell appops set $PKG SYSTEM_ALERT_WINDOW allow

echo "== notifications + battery exemption =="
adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS || true
adb shell dumpsys deviceidle whitelist +$PKG >/dev/null

if [ "$SET_DO" = "--device-owner" ]; then
  echo "== device-owner (fresh phone, no accounts) =="
  adb shell dpm set-device-owner "$ADMIN" || { echo "set-device-owner failed; falling back to active-admin"; adb shell dpm set-active-admin "$ADMIN" || true; }
else
  echo "== active-admin (uninstall protection) =="
  adb shell dpm set-active-admin "$ADMIN" || true
fi

echo "== configure + start tracking =="
adb shell am start -n "$SETUP" \
  --es cfg_api_url "$API_URL" \
  --es cfg_hackathon_id "$HACKATHON_ID" \
  --es cfg_team_id "$TEAM_ID" \
  --es cfg_team_name "$TEAM_NAME" \
  --es cfg_passcode "$PASSCODE" >/dev/null

echo ""
echo "DONE — $TEAM_ID provisioned. Appears on the dashboard within ~60s."
