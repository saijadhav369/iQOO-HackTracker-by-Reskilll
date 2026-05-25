<#
  HackTracker fleet provisioning — one command per phone, fully scripted.

  Does EVERYTHING over ADB so there is no manual tapping on the phone:
    install APK, grant Accessibility + Usage Access + Overlay + Notifications,
    battery-optimization exemption, (optional) device-owner, then injects the
    hackathon/team config and starts tracking.

  Settings persist across reboots, so each phone is provisioned ONCE.

  Usage (one phone connected via USB):
    .\provision.ps1 -TeamId team_01 -TeamName "CodeCrafters" `
                    -ApiUrl https://your-app.up.railway.app/api `
                    -HackathonId iqoo_2026 -Passcode 123456

  Notes:
   - Device-owner (-SetDeviceOwner) ONLY works on a freshly-reset phone with no
     accounts added. It is what blocks uninstall + exempts the app from iQOO
     battery-killing. If it fails, the script continues with active-admin
     (uninstall protection only).
   - APK path defaults to the debug build; pass -ApkPath for a release APK.
#>

param(
  [Parameter(Mandatory = $true)][string]$TeamId,
  [Parameter(Mandatory = $true)][string]$TeamName,
  [Parameter(Mandatory = $true)][string]$ApiUrl,
  [Parameter(Mandatory = $true)][string]$HackathonId,
  [Parameter(Mandatory = $true)][string]$Passcode,
  [string]$ApkPath = "$PSScriptRoot\app\build\outputs\apk\debug\app-debug.apk",
  [switch]$SetDeviceOwner
)

$ErrorActionPreference = "Stop"
$PKG = "com.reskill.hacktracker"
$ACC = "$PKG/$PKG.services.HackTrackerAccessibilityService"
$ADMIN = "$PKG/$PKG.receivers.HackTrackerAdminReceiver"
$SETUP = "$PKG/$PKG.ui.SetupActivity"

# Locate adb
$adb = (Get-Command adb -ErrorAction SilentlyContinue).Source
if (-not $adb) {
  $cand = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"
  if (Test-Path $cand) { $adb = $cand } else { throw "adb not found on PATH or in the Android SDK." }
}
function Adb { & $adb @args }

Write-Host "== waiting for device ==" -ForegroundColor Cyan
Adb wait-for-device

Write-Host "== install APK ==" -ForegroundColor Cyan
Adb install -r "$ApkPath"

Write-Host "== Accessibility (append, don't clobber existing) ==" -ForegroundColor Cyan
$cur = (Adb shell settings get secure enabled_accessibility_services).Trim()
if ($cur -eq "null" -or [string]::IsNullOrWhiteSpace($cur)) { $new = $ACC }
elseif ($cur -like "*$ACC*") { $new = $cur }
else { $new = "$cur`:$ACC" }
Adb shell settings put secure enabled_accessibility_services $new
Adb shell settings put secure accessibility_enabled 1

Write-Host "== Usage Access + Overlay (appops) ==" -ForegroundColor Cyan
Adb shell appops set $PKG GET_USAGE_STATS allow
Adb shell appops set $PKG SYSTEM_ALERT_WINDOW allow

Write-Host "== Notifications + battery exemption ==" -ForegroundColor Cyan
Adb shell pm grant $PKG android.permission.POST_NOTIFICATIONS 2>$null
Adb shell dumpsys deviceidle whitelist +$PKG | Out-Null

if ($SetDeviceOwner) {
  Write-Host "== device-owner (fresh phone, no accounts) ==" -ForegroundColor Cyan
  try { Adb shell dpm set-device-owner $ADMIN }
  catch { Write-Warning "set-device-owner failed (phone has accounts?). Falling back to active-admin."; Adb shell dpm set-active-admin $ADMIN }
} else {
  Write-Host "== active-admin (uninstall protection) ==" -ForegroundColor Cyan
  try { Adb shell dpm set-active-admin $ADMIN } catch { Write-Warning "set-active-admin failed: $_" }
}

Write-Host "== configure + start tracking ==" -ForegroundColor Cyan
Adb shell am start -n $SETUP `
  --es cfg_api_url "$ApiUrl" `
  --es cfg_hackathon_id "$HackathonId" `
  --es cfg_team_id "$TeamId" `
  --es cfg_team_name "$TeamName" `
  --es cfg_passcode "$Passcode" | Out-Null

Write-Host "`nDONE — $TeamId provisioned. It should appear on the dashboard within ~60s." -ForegroundColor Green
