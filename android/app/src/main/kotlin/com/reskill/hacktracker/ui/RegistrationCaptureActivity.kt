package com.reskill.hacktracker.ui

import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.telephony.TelephonyManager
import android.text.InputType
import android.util.Log
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import com.reskill.hacktracker.R
import com.reskill.hacktracker.data.remote.ApiClient
import com.reskill.hacktracker.util.PasscodeManager
import com.reskill.hacktracker.util.SessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File

/**
 * Organiser-facing registration-photo capture screen. Reached from its own
 * launcher icon ("Register") so participants can't tap their way in from the
 * tracking UI. Always re-prompts for the admin passcode before launching the
 * camera; the photo is uploaded with the device's IMEI (best-effort, device-
 * owner only) and recorded against the team this device is paired to via
 * SessionManager.
 *
 * Uses Intent.ACTION_IMAGE_CAPTURE (the system camera) rather than CameraX to
 * keep the camera lifecycle out of our code -- the OS camera handles preview,
 * focus, orientation, and the save. We just receive a file URI back. The
 * organiser switches to the selfie lens manually when the camera opens.
 */
class RegistrationCaptureActivity : AppCompatActivity() {

    private lateinit var session: SessionManager
    private lateinit var passcodeManager: PasscodeManager
    private lateinit var statusText: TextView
    private lateinit var captureButton: Button

    private var pendingPhotoFile: File? = null
    // True from the moment the user taps Capture until the upload finishes (or
    // any step in between aborts). onResume uses this to avoid stomping the
    // "Opening camera…" / "Uploading…" status text -- the AndroidX activity-
    // result callback can fire either before or after onResume depending on
    // Android version, so a simpler `pendingPhotoFile == null` guard isn't
    // reliable.
    private var inFlight: Boolean = false

    private val takePictureLauncher = registerForActivityResult(
        ActivityResultContracts.TakePicture()
    ) { ok ->
        val file = pendingPhotoFile
        pendingPhotoFile = null
        if (!ok || file == null || !file.exists() || file.length() == 0L) {
            runCatching { file?.delete() }
            inFlight = false
            setStatus(getString(R.string.registration_status_cancelled))
            captureButton.isEnabled = true
            return@registerForActivityResult
        }
        uploadCapturedPhoto(file)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_registration_capture)
        session = SessionManager(this)
        passcodeManager = PasscodeManager(this)
        statusText = findViewById(R.id.registrationStatus)
        captureButton = findViewById(R.id.registrationCaptureButton)
        captureButton.setOnClickListener { onCaptureClicked() }
        refreshStatus()
    }

    override fun onResume() {
        super.onResume()
        // Skip the refresh while a capture/upload is in flight; the result
        // callback and upload coroutine own the status text in that window.
        if (!inFlight) refreshStatus()
    }

    private fun refreshStatus() {
        if (!session.isConfigured) {
            setStatus(getString(R.string.registration_status_not_configured))
            captureButton.isEnabled = false
            return
        }
        if (!passcodeManager.isPasscodeSet) {
            setStatus(getString(R.string.registration_status_no_passcode))
            captureButton.isEnabled = false
            return
        }
        if (passcodeManager.isLockedOut) {
            setStatus(getString(R.string.registration_status_locked_out))
            captureButton.isEnabled = false
            return
        }
        setStatus(getString(R.string.registration_status_ready))
        captureButton.isEnabled = true
    }

    private fun setStatus(message: String) {
        statusText.text = message
    }

    private fun onCaptureClicked() {
        if (passcodeManager.isLockedOut) {
            refreshStatus()
            return
        }
        inFlight = true
        promptPasscode { ok ->
            if (ok) {
                launchCamera()
            } else {
                inFlight = false
            }
        }
    }

    private fun promptPasscode(onResult: (Boolean) -> Unit) {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            hint = getString(R.string.registration_passcode_hint)
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.registration_passcode_title)
            .setMessage(R.string.registration_passcode_message)
            .setView(input)
            .setCancelable(false)
            .setPositiveButton(R.string.registration_passcode_verify) { dialog, _ ->
                val entered = input.text?.toString()?.trim().orEmpty()
                if (entered.isEmpty()) {
                    Toast.makeText(
                        this,
                        R.string.registration_passcode_required,
                        Toast.LENGTH_SHORT
                    ).show()
                    dialog.dismiss()
                    onResult(false)
                    return@setPositiveButton
                }
                if (passcodeManager.verify(entered)) {
                    passcodeManager.clearLockout()
                    dialog.dismiss()
                    onResult(true)
                } else {
                    passcodeManager.recordFailedAttempt()
                    Toast.makeText(
                        this,
                        R.string.registration_passcode_incorrect,
                        Toast.LENGTH_SHORT
                    ).show()
                    dialog.dismiss()
                    refreshStatus()
                    onResult(false)
                }
            }
            .setNegativeButton(R.string.registration_cancel) { dialog, _ ->
                dialog.dismiss()
                onResult(false)
            }
            .show()
    }

    private fun launchCamera() {
        val uri: Uri = try {
            val dir = File(cacheDir, "face_photos").apply { mkdirs() }
            val file = File(dir, "capture-${System.currentTimeMillis()}.jpg")
            pendingPhotoFile = file
            FileProvider.getUriForFile(
                this,
                "${packageName}.fileprovider",
                file
            )
        } catch (e: Exception) {
            Log.w("HackTracker", "registration: FileProvider URI build failed", e)
            pendingPhotoFile = null
            inFlight = false
            setStatus(
                getString(R.string.registration_status_open_failed, e.message ?: "unknown error")
            )
            captureButton.isEnabled = true
            return
        }

        captureButton.isEnabled = false
        setStatus(getString(R.string.registration_status_opening))
        try {
            takePictureLauncher.launch(uri)
        } catch (e: Exception) {
            Log.w("HackTracker", "registration: takePicture launch failed", e)
            runCatching { pendingPhotoFile?.delete() }
            pendingPhotoFile = null
            inFlight = false
            captureButton.isEnabled = true
            setStatus(
                getString(R.string.registration_status_open_failed, e.message ?: "unknown error")
            )
        }
    }

    private fun uploadCapturedPhoto(file: File) {
        setStatus(getString(R.string.registration_status_uploading))
        val imei = readImeiBestEffort()
        CoroutineScope(Dispatchers.IO).launch {
            val bytes: ByteArray = try {
                file.readBytes()
            } catch (e: Exception) {
                Log.w("HackTracker", "registration: read captured file failed", e)
                runCatching { file.delete() }
                withContext(Dispatchers.Main) {
                    inFlight = false
                    setStatus(
                        getString(
                            R.string.registration_status_read_failed,
                            e.message ?: "unknown"
                        )
                    )
                    captureButton.isEnabled = true
                }
                return@launch
            }
            runCatching { file.delete() }

            val ok = try {
                val imagePart = MultipartBody.Part.createFormData(
                    "image",
                    "face-${System.currentTimeMillis()}.jpg",
                    bytes.toRequestBody("image/jpeg".toMediaTypeOrNull())
                )
                val plain = "text/plain".toMediaTypeOrNull()
                val response = ApiClient.getService(session.apiUrl).uploadFacePhoto(
                    image = imagePart,
                    teamId = session.teamId.toRequestBody(plain),
                    deviceId = session.deviceId.toRequestBody(plain),
                    hackathonId = session.hackathonId.toRequestBody(plain),
                    imei = (imei ?: "").toRequestBody(plain)
                )
                Log.w(
                    "HackTracker",
                    "registration: upload HTTP ${response.code()} (${bytes.size}b, imei=${imei ?: "null"})"
                )
                response.isSuccessful
            } catch (e: Exception) {
                Log.w("HackTracker", "registration: upload failed", e)
                false
            }

            withContext(Dispatchers.Main) {
                inFlight = false
                if (ok) {
                    setStatus(
                        if (imei == null) {
                            getString(R.string.registration_status_uploaded_no_imei)
                        } else {
                            getString(R.string.registration_status_uploaded_with_imei, imei)
                        }
                    )
                } else {
                    setStatus(getString(R.string.registration_status_upload_failed))
                }
                captureButton.isEnabled = true
            }
        }
    }

    /**
     * Try to read IMEI on slot 0. Returns null on any failure -- regular apps
     * on Android 10+ cannot read IMEI unless device-owner or carrier, and we
     * intentionally degrade silently rather than blocking the capture.
     */
    private fun readImeiBestEffort(): String? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null
        return try {
            val tm = getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
                ?: return null
            val imei = tm.getImei(0)
            if (imei.isNullOrBlank()) null else imei
        } catch (_: SecurityException) {
            null
        } catch (_: Exception) {
            null
        }
    }
}
