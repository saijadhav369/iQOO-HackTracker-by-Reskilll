// Generate a device-owner provisioning QR for HackTracker.
//
// On a freshly-reset phone, tap the first "Welcome" screen 6 times to open the
// QR scanner, then scan the PNG this produces. The phone downloads the APK,
// sets HackTracker as device-owner, and HackTrackerAdminReceiver.onProfile
// ProvisioningComplete configures + starts tracking from the embedded extras.
//
// Usage (from android/):
//   node tools/make-provisioning-qr.mjs
// Configure via env vars (all have dev defaults):
//   APK_URL        public https URL serving app-debug.apk (REQUIRED for real use)
//   SIG_CHECKSUM   hex SHA-256 of the signing cert (default = current debug cert)
//   WIFI_SSID, WIFI_PASS, WIFI_TYPE   (WIFI_TYPE: WPA | NONE)
//   API_URL, HACKATHON_ID, TEAM_ID, TEAM_NAME, PASSCODE
//
// Reminder: QR provisioning canNOT enable Accessibility / Usage Access (those
// need WRITE_SECURE_SETTINGS = ADB only). Finish those with provision.ps1 or one
// manual tap per phone.

import { writeFile } from "node:fs/promises";

const PKG = "com.reskill.hacktracker";
const ADMIN = `${PKG}/${PKG}.receivers.HackTrackerAdminReceiver`;

// Current debug signing-cert SHA-256 (from: apksigner verify --print-certs).
// Override with SIG_CHECKSUM env for a release APK.
const sigHex =
  process.env.SIG_CHECKSUM ||
  "ee267b07dcd10d6259ff77dceabf4d98d0d4e64ddcc8d26ce70bbf18df1a3705";
const sigChecksum = Buffer.from(sigHex.replace(/\s/g, ""), "hex").toString(
  "base64url"
);

const provisioning = {
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": ADMIN,
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM": sigChecksum,
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION":
    process.env.APK_URL || "https://REPLACE-ME/app-debug.apk",
  "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": true,
  "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": false,
  "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
    cfg_api_url: process.env.API_URL || "https://REPLACE-ME/api",
    cfg_hackathon_id: process.env.HACKATHON_ID || "iqoo_2026",
    cfg_team_id: process.env.TEAM_ID || "team_01",
    cfg_team_name: process.env.TEAM_NAME || "CodeCrafters",
    cfg_passcode: process.env.PASSCODE || "123456",
  },
};

// Wi-Fi so the phone can reach the APK URL during provisioning (optional but
// usually required — the device has no network yet).
if (process.env.WIFI_SSID) {
  provisioning["android.app.extra.PROVISIONING_WIFI_SSID"] = process.env.WIFI_SSID;
  provisioning["android.app.extra.PROVISIONING_WIFI_SECURITY_TYPE"] =
    process.env.WIFI_TYPE || "WPA";
  if (process.env.WIFI_PASS) {
    provisioning["android.app.extra.PROVISIONING_WIFI_PASSWORD"] =
      process.env.WIFI_PASS;
  }
}

const json = JSON.stringify(provisioning);
await writeFile("provisioning.json", JSON.stringify(provisioning, null, 2));
console.log("Wrote provisioning.json");
console.log("Signature checksum (base64url):", sigChecksum);

// Render the QR PNG. qrcode is loaded dynamically so this file has no hard dep.
try {
  const QR = (await import("qrcode")).default;
  await QR.toFile("provisioning-qr.png", json, {
    errorCorrectionLevel: "M",
    width: 800,
    margin: 2,
  });
  console.log("Wrote provisioning-qr.png  →  scan this on a factory-reset phone.");
} catch {
  console.log(
    "\n`qrcode` not installed. Render the QR with either:\n" +
      "  npx qrcode -o provisioning-qr.png \"$(cat provisioning.json)\"\n" +
      "  (or: npm i qrcode, then re-run this script)\n"
  );
}

if (
  provisioning[
    "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION"
  ].includes("REPLACE-ME")
) {
  console.log(
    "\n⚠ Set APK_URL (and API_URL) env vars to real values before using on hardware."
  );
}
