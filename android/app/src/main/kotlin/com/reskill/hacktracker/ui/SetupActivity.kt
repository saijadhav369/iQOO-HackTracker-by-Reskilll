package com.reskill.hacktracker.ui

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import android.app.Activity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.work.*
import com.google.android.material.textfield.MaterialAutoCompleteTextView
import com.reskill.hacktracker.R
import com.reskill.hacktracker.data.remote.ApiClient
import com.reskill.hacktracker.data.remote.dto.TeamSummaryDto
import com.reskill.hacktracker.receivers.HackTrackerAdminReceiver
import com.reskill.hacktracker.services.DataSyncWorker
import com.reskill.hacktracker.services.HackTrackerAccessibilityService
import com.reskill.hacktracker.services.MediaProjectionHolder
import com.reskill.hacktracker.services.ScreenshotCaptor
import com.reskill.hacktracker.services.TrackingForegroundService
import com.reskill.hacktracker.util.PasscodeManager
import com.reskill.hacktracker.util.SessionManager
import kotlinx.coroutines.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

class SetupActivity : AppCompatActivity() {

    private lateinit var session: SessionManager
    private lateinit var passcodeManager: PasscodeManager

    private lateinit var statusText: TextView
    private lateinit var tapCountText: TextView
    private lateinit var deviceIdText: TextView
    private lateinit var apiUrlInput: EditText
    private lateinit var hackathonIdInput: EditText
    private lateinit var teamDropdown: MaterialAutoCompleteTextView
    private lateinit var loadTeamsButton: Button
    private lateinit var memberNameInput: EditText
    private lateinit var passcodeSetInput: EditText
    private lateinit var saveButton: Button
    private lateinit var stopButton: Button

    // Mirrors what the dropdown currently shows. `selectedTeam` is the row the
    // user picked (or that we pre-selected based on session.teamId). Slot is
    // assigned by the server during register — no UI input here.
    private var availableTeams: List<TeamSummaryDto> = emptyList()
    private var selectedTeam: TeamSummaryDto? = null
    // Captures any cfg_team_id extra so we can re-apply it once the team list
    // arrives. Cleared after first successful match so re-fetches don't keep
    // overriding manual user picks.
    private var pendingTeamIdFromExtras: String? = null

    private var statusUpdateJob: Job? = null

    private val deviceAdminLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        updateUI()
    }

    // POST_NOTIFICATIONS (Android 13+) must be granted at runtime or the system
    // silently drops every notify() call — including organiser blast pushes. The
    // foreground-service notification is exempt, which is why tracking still
    // "works" while broadcasts never reach the phone.
    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (!granted) {
            Toast.makeText(
                this,
                "Notifications are off — organiser alerts won't show. Enable them in Settings.",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    private val mediaProjectionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            MediaProjectionHolder.setToken(result.resultCode, result.data)
            Toast.makeText(this, "Screen capture authorised", Toast.LENGTH_SHORT).show()
        } else {
            Toast.makeText(this, "Screen capture not granted", Toast.LENGTH_SHORT).show()
        }
    }

    private fun isDeviceOwner(): Boolean {
        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as? android.app.admin.DevicePolicyManager
            ?: return false
        return dpm.isDeviceOwnerApp(packageName)
    }

    private fun maybeRequestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = ContextCompat.checkSelfPermission(
            this, Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun requestMediaProjectionConsent() {
        val intent = ScreenshotCaptor.createScreenCaptureIntent(this) ?: return
        mediaProjectionLauncher.launch(intent)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_setup)

        session = SessionManager(this)
        passcodeManager = PasscodeManager(this)

        statusText = findViewById(R.id.statusText)
        tapCountText = findViewById(R.id.tapCountText)
        deviceIdText = findViewById(R.id.deviceIdText)
        apiUrlInput = findViewById(R.id.apiUrlInput)
        hackathonIdInput = findViewById(R.id.hackathonIdInput)
        teamDropdown = findViewById(R.id.teamDropdown)
        loadTeamsButton = findViewById(R.id.loadTeamsButton)
        memberNameInput = findViewById(R.id.memberNameInput)
        passcodeSetInput = findViewById(R.id.passcodeSetInput)
        saveButton = findViewById(R.id.saveButton)
        stopButton = findViewById(R.id.stopButton)

        // If tracking is active and passcode is set, require passcode to open
        // But skip if passcode was verified in the last 5 minutes
        if (session.isTracking && passcodeManager.isPasscodeSet) {
            val lastVerified = getSharedPreferences("hacktracker_prefs", MODE_PRIVATE)
                .getLong("passcode_verified_at", 0)
            val fiveMinMs = 10 * 1000L // 10 seconds for testing, change to 5*60*1000L for prod
            if (System.currentTimeMillis() - lastVerified > fiveMinMs) {
                val intent = Intent(this, PasscodeActivity::class.java)
                intent.putExtra("source", "app_open")
                startActivity(intent)
            }
        }

        // Auto-restart foreground service if tracking is on but service died (e.g. after app update)
        if (session.isTracking && session.isConfigured) {
            val serviceIntent = Intent(this, TrackingForegroundService::class.java)
            startForegroundService(serviceIntent)
        }

        // Pre-fill from saved config. teamDropdown is populated async once
        // listTeams returns; saved session.teamId is then matched by id to
        // pre-select the right row.
        apiUrlInput.setText(session.apiUrl)
        hackathonIdInput.setText(session.hackathonId)
        memberNameInput.setText(session.memberName)
        deviceIdText.text = "Device ID: ${session.deviceId}"

        // Ask for POST_NOTIFICATIONS up front — without it, Android 13+ drops
        // organiser blast pushes (and the heads-up chime) on the floor.
        maybeRequestNotificationPermission()

        // Ask once for SYSTEM_ALERT_WINDOW so the red-light overlay can render.
        if (!Settings.canDrawOverlays(this)) {
            try {
                startActivity(
                    Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:$packageName")
                    )
                )
            } catch (_: Exception) {}
        }

        // Screen capture fallback: device-owner uses Accessibility.takeScreenshot
        // and needs no prompt. Non-DO devices need a one-time MediaProjection
        // grant — re-asked if the process restarts (Android token cannot persist).
        if (!isDeviceOwner() && !MediaProjectionHolder.hasToken()) {
            try { requestMediaProjectionConsent() } catch (_: Exception) {}
        }

        updateUI()

        saveButton.setOnClickListener { saveAndStart() }
        stopButton.setOnClickListener { stopTracking() }

        teamDropdown.setOnItemClickListener { _, _, position, _ ->
            selectedTeam = availableTeams.getOrNull(position)
        }

        loadTeamsButton.setOnClickListener {
            // Manual refresh path — toast the result so the organiser knows the
            // fetch actually happened (vs. a silent retry).
            refreshTeamDropdown(showToast = true)
        }

        // Hitting "Done" on the hackathon-id keyboard also refreshes the
        // dropdown — saves a tap when the organiser corrects the id and
        // wants to see the team list immediately.
        hackathonIdInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == android.view.inputmethod.EditorInfo.IME_ACTION_DONE) {
                refreshTeamDropdown(showToast = true)
                true
            } else false
        }

        // Headless provisioning: configure + start from intent extras so a phone
        // can be set up by an ADB script without manual typing. Provisioning
        // scripts now pass only cfg_api_url / cfg_hackathon_id / cfg_passcode
        // (+ optional cfg_member_name); team is always picked from the dropdown
        // on the phone. cfg_team_id is still honoured for headless flows that
        // know the team in advance — we match it once the team list arrives.
        maybeConfigureFromExtras()

        // Kick off the async team fetch. Re-fetches whenever the hackathon id
        // or api url change above.
        refreshTeamDropdown()
    }

    /**
     * Pre-fill whatever cfg_* extras the launching intent carries and queue
     * cfg_team_id for matching once the team list loads. The auto-saveAndStart
     * fast path fires only when all required fields are present AND we have a
     * matched team — otherwise the organiser taps Save manually.
     */
    private fun maybeConfigureFromExtras() {
        if (session.isTracking) return
        val apiUrl = intent?.getStringExtra("cfg_api_url")
        val hackathonId = intent?.getStringExtra("cfg_hackathon_id")
        val teamId = intent?.getStringExtra("cfg_team_id")
        val memberName = intent?.getStringExtra("cfg_member_name")
        val passcode = intent?.getStringExtra("cfg_passcode")

        if (apiUrl.isNullOrBlank() && hackathonId.isNullOrBlank()
            && teamId.isNullOrBlank() && memberName.isNullOrBlank()
            && passcode.isNullOrBlank()) return

        if (!apiUrl.isNullOrBlank()) apiUrlInput.setText(apiUrl)
        if (!hackathonId.isNullOrBlank()) hackathonIdInput.setText(hackathonId)
        if (!memberName.isNullOrBlank()) memberNameInput.setText(memberName)
        if (!passcode.isNullOrBlank()) passcodeSetInput.setText(passcode)
        if (!teamId.isNullOrBlank()) {
            // Cache for late-binding in refreshTeamDropdown's success callback.
            pendingTeamIdFromExtras = teamId
            // Persist so a save-without-load fallback at least has the right id.
            session.teamId = teamId
        }
    }

    /**
     * Normalize the API URL the organiser typed. Two corrections:
     *   1. If there's no scheme, default to http:// for private IPs / localhost
     *      (LAN dev servers) and https:// otherwise.
     *   2. If the scheme is https:// but the host is a private IP / localhost,
     *      downgrade to http:// — dev servers (e.g. `pnpm dev` on a LAN box)
     *      can't terminate TLS, and the resulting "Unable to parse TLS packet
     *      header" error is opaque to the organiser. Public hostnames keep
     *      whatever scheme was typed.
     */
    private fun normalizeApiUrl(input: String): String {
        var url = input.trim().trimEnd('/')
        if (url.isEmpty()) return url
        val hasScheme = url.startsWith("http://") || url.startsWith("https://")
        val hostPlusPath = if (hasScheme) url.removePrefix("https://").removePrefix("http://") else url
        val host = hostPlusPath.substringBefore('/').substringBefore(':')
        val isPrivate = isPrivateOrLocalhostHost(host)
        return when {
            !hasScheme -> if (isPrivate) "http://$url" else "https://$url"
            url.startsWith("https://") && isPrivate -> "http://$hostPlusPath"
            else -> url
        }
    }

    private fun isPrivateOrLocalhostHost(host: String): Boolean {
        if (host.isBlank()) return false
        if (host == "localhost") return true
        if (host.startsWith("127.")) return true
        if (host.startsWith("10.")) return true
        if (host.startsWith("192.168.")) return true
        // 172.16.0.0 – 172.31.255.255
        if (host.startsWith("172.")) {
            val second = host.substringAfter("172.").substringBefore('.').toIntOrNull()
            if (second != null && second in 16..31) return true
        }
        return false
    }

    /**
     * Fetch the registered teams for the current hackathon and populate the
     * dropdown adapter. Safe to call any number of times — replaces the
     * adapter on each successful response. `showToast=true` reports the
     * count (success or failure) — used for manual taps on Load Teams /
     * the keyboard's Done action so the organiser gets explicit feedback.
     */
    private fun refreshTeamDropdown(showToast: Boolean = false) {
        val typedUrl = apiUrlInput.text.toString().trim()
        val apiUrl = normalizeApiUrl(typedUrl)
        // If normalization rewrote the URL (e.g. https://10.x → http://10.x),
        // reflect the correction in the input so the organiser sees what's
        // actually being used and the saved session.apiUrl matches.
        if (apiUrl != typedUrl) apiUrlInput.setText(apiUrl)
        val hackathonId = hackathonIdInput.text.toString().trim()
        if (apiUrl.isBlank() || hackathonId.isBlank()) {
            if (showToast) {
                Toast.makeText(
                    this,
                    "Fill the API URL and Hackathon ID first.",
                    Toast.LENGTH_SHORT
                ).show()
            }
            return
        }
        if (showToast) {
            Toast.makeText(this, "Loading teams…", Toast.LENGTH_SHORT).show()
        }
        CoroutineScope(Dispatchers.IO).launch {
            var errorMessage: String? = null
            val teams = try {
                val resp = ApiClient.getService(apiUrl).listTeams(hackathonId)
                if (resp.isSuccessful) {
                    resp.body() ?: emptyList()
                } else {
                    errorMessage = "HTTP ${resp.code()}"
                    emptyList()
                }
            } catch (e: Exception) {
                errorMessage = e.message ?: "network error"
                emptyList()
            }
            withContext(Dispatchers.Main) {
                availableTeams = teams
                val labels = teams.map { "${it.name} (${it.id})" }
                val adapter = ArrayAdapter(
                    this@SetupActivity,
                    android.R.layout.simple_list_item_1,
                    labels
                )
                teamDropdown.setAdapter(adapter)

                if (showToast) {
                    val msg = when {
                        errorMessage != null -> "Could not load teams: $errorMessage"
                        teams.isEmpty() -> "No teams found for '$hackathonId'. Register them on the dashboard's Manage page first."
                        teams.size == 1 -> "Loaded 1 team."
                        else -> "Loaded ${teams.size} teams."
                    }
                    Toast.makeText(this@SetupActivity, msg, Toast.LENGTH_LONG).show()
                }

                // Pre-select: cfg_team_id extra wins, then saved session.teamId.
                val preferredId = pendingTeamIdFromExtras ?: session.teamId
                val match = if (preferredId.isNotBlank()) {
                    teams.firstOrNull { it.id == preferredId }
                } else null
                if (match != null) {
                    selectedTeam = match
                    teamDropdown.setText("${match.name} (${match.id})", false)
                    pendingTeamIdFromExtras = null
                    // Auto-start when the headless flow provided everything.
                    maybeAutoStartFromExtras()
                }
            }
        }
    }

    /**
     * Headless / batch provisioning: if every required field came in via
     * cfg_* extras AND the dropdown matched a team, fire saveAndStart()
     * automatically. Otherwise the organiser taps Save manually.
     */
    private fun maybeAutoStartFromExtras() {
        if (session.isTracking) return
        val apiUrl = apiUrlInput.text.toString().trim()
        val hackathonId = hackathonIdInput.text.toString().trim()
        val memberName = memberNameInput.text.toString().trim()
        val passcode = passcodeSetInput.text.toString().trim()
        val hasPasscode = passcode.isNotBlank() || passcodeManager.isPasscodeSet
        if (selectedTeam == null) return
        if (apiUrl.isBlank() || hackathonId.isBlank() || memberName.isBlank() || !hasPasscode) return
        saveAndStart()
    }

    override fun onResume() {
        super.onResume()
        if (!isDeviceOwner() && !MediaProjectionHolder.hasToken()) {
            try { requestMediaProjectionConsent() } catch (_: Exception) {}
        }
        statusUpdateJob = CoroutineScope(Dispatchers.Main).launch {
            while (isActive) {
                updateUI()
                delay(1000)
            }
        }
    }

    override fun onPause() {
        super.onPause()
        statusUpdateJob?.cancel()
    }

    private fun isDeviceAdminActive(): Boolean {
        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val adminComponent = ComponentName(this, HackTrackerAdminReceiver::class.java)
        return dpm.isAdminActive(adminComponent)
    }

    private fun requestDeviceAdmin() {
        val adminComponent = ComponentName(this, HackTrackerAdminReceiver::class.java)
        val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
            putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent)
            putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                "Required to prevent participants from uninstalling HackTracker during the hackathon.")
        }
        deviceAdminLauncher.launch(intent)
    }

    private fun updateUI() {
        val accessibilityRunning = HackTrackerAccessibilityService.instance != null
        val tracking = session.isTracking
        val adminActive = isDeviceAdminActive()

        val statusParts = mutableListOf<String>()

        if (tracking && accessibilityRunning) {
            statusParts.add("TRACKING")
            val taps = HackTrackerAccessibilityService.instance?.totalTaps ?: 0
            val app = HackTrackerAccessibilityService.instance?.currentApp?.split(".")?.lastOrNull() ?: "—"
            tapCountText.text = "Taps: $taps | Current app: $app"
        } else if (tracking) {
            statusParts.add("Configured (enable Accessibility Service!)")
            tapCountText.text = "Settings > Accessibility > HackTracker > ON"
        } else {
            statusParts.add("Not tracking")
            tapCountText.text = "Configure and start below"
        }

        if (!adminActive) statusParts.add("Uninstall protection: OFF")

        statusText.text = "Status: ${statusParts.joinToString(" | ")}"

        if (tracking) {
            saveButton.visibility = View.GONE
            stopButton.visibility = View.VISIBLE
            apiUrlInput.isEnabled = false
            hackathonIdInput.isEnabled = false
            teamDropdown.isEnabled = false
            loadTeamsButton.isEnabled = false
            memberNameInput.isEnabled = false
            passcodeSetInput.isEnabled = false
        } else {
            saveButton.visibility = View.VISIBLE
            stopButton.visibility = View.GONE
            apiUrlInput.isEnabled = true
            hackathonIdInput.isEnabled = true
            teamDropdown.isEnabled = true
            loadTeamsButton.isEnabled = true
            memberNameInput.isEnabled = true
            passcodeSetInput.isEnabled = true
        }
    }

    private fun saveAndStart() {
        val typedUrl = apiUrlInput.text.toString().trim()
        val apiUrl = normalizeApiUrl(typedUrl)
        if (apiUrl != typedUrl) apiUrlInput.setText(apiUrl)
        val hackathonId = hackathonIdInput.text.toString().trim()
        val memberName = memberNameInput.text.toString().trim()
        val passcode = passcodeSetInput.text.toString().trim()

        if (apiUrl.isBlank() || hackathonId.isBlank() || memberName.isBlank()) {
            Toast.makeText(this, "Fill all fields", Toast.LENGTH_SHORT).show()
            return
        }

        val team = selectedTeam
        if (team == null) {
            if (availableTeams.isEmpty()) {
                Toast.makeText(
                    this,
                    "No teams registered for this hackathon. Open the dashboard's Manage page and add a team first, then come back.",
                    Toast.LENGTH_LONG
                ).show()
            } else {
                Toast.makeText(this, "Pick your team from the dropdown.", Toast.LENGTH_SHORT).show()
            }
            return
        }

        if (!passcodeManager.isPasscodeSet && passcode.length < 6) {
            Toast.makeText(this, "Passcode must be at least 6 digits", Toast.LENGTH_SHORT).show()
            return
        }

        // Save configuration. memberSlot is left at whatever it was (0 = not
        // yet assigned); TrackingRepository.registerDevice sends null and reads
        // the server-assigned slot back into session.memberSlot on success.
        session.apiUrl = apiUrl
        session.hackathonId = hackathonId
        session.teamId = team.id
        session.teamName = team.name
        session.memberName = memberName

        if (passcode.isNotBlank()) {
            passcodeManager.setPasscode(passcode)
        }

        if (!isDeviceAdminActive()) {
            requestDeviceAdmin()
        }

        saveButton.isEnabled = false
        saveButton.text = "Starting..."
        CoroutineScope(Dispatchers.IO).launch {
            val repository = com.reskill.hacktracker.data.repository.TrackingRepository(applicationContext)
            val result = repository.registerDevice()
            withContext(Dispatchers.Main) {
                saveButton.isEnabled = true
                saveButton.text = "Save & Start Tracking"

                when (result) {
                    is com.reskill.hacktracker.data.repository.TrackingRepository.RegisterResult.SlotConflict -> {
                        Toast.makeText(
                            this@SetupActivity,
                            "Member slot ${result.slot} is already taken on this team. Tap Save again to let the server pick a fresh slot.",
                            Toast.LENGTH_LONG
                        ).show()
                        // Reset stored slot so the next attempt requests auto-assign.
                        session.memberSlot = 0
                        return@withContext
                    }
                    is com.reskill.hacktracker.data.repository.TrackingRepository.RegisterResult.Failure -> {
                        Toast.makeText(
                            this@SetupActivity,
                            "Could not reach server — will retry in background.",
                            Toast.LENGTH_LONG
                        ).show()
                    }
                    is com.reskill.hacktracker.data.repository.TrackingRepository.RegisterResult.Success -> {}
                }

                session.isTracking = true

                val serviceIntent = Intent(this@SetupActivity, TrackingForegroundService::class.java)
                startForegroundService(serviceIntent)

                val syncRequest = PeriodicWorkRequestBuilder<DataSyncWorker>(
                    15, TimeUnit.MINUTES
                )
                    .setConstraints(
                        Constraints.Builder()
                            .setRequiredNetworkType(NetworkType.CONNECTED)
                            .build()
                    )
                    .build()

                WorkManager.getInstance(this@SetupActivity).enqueueUniquePeriodicWork(
                    "hacktracker_sync",
                    ExistingPeriodicWorkPolicy.KEEP,
                    syncRequest
                )

                Toast.makeText(this@SetupActivity, "Tracking started!", Toast.LENGTH_SHORT).show()
                updateUI()
            }
        }
    }

    private fun stopTracking() {
        session.cleanExit = true
        session.isTracking = false
        stopService(Intent(this, TrackingForegroundService::class.java))
        WorkManager.getInstance(this).cancelUniqueWork("hacktracker_sync")
        Toast.makeText(this, "Tracking stopped", Toast.LENGTH_SHORT).show()
        updateUI()
    }
}
