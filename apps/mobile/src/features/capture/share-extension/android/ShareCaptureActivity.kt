package dev.skriuw.app.capture

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import java.io.File
import java.util.Calendar
import java.util.UUID

/**
 * The Android half of share-to-Skriuw. It is a trampoline, not a screen: the
 * shared text is appended to the durable capture inbox before anything else
 * happens, and only then is the application launched to drain it. Killing the
 * process between the two therefore loses nothing — the record is already on
 * disk (`docs/specs/mobile-app.md`, R-F8).
 *
 * The file name, its directory and its one-JSON-object-per-line encoding are
 * the contract with `apps/mobile/src/features/capture/file-inbox.ts`; `filesDir`
 * is what expo-file-system calls the document directory on Android.
 */
class ShareCaptureActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val incoming = intent
        if (incoming != null && Intent.ACTION_SEND == incoming.action) {
            val text = incoming.getStringExtra(Intent.EXTRA_TEXT)
            if (!text.isNullOrBlank()) {
                queue(text, incoming.getStringExtra(Intent.EXTRA_SUBJECT))
            }
        }
        openJournal()
        finish()
    }

    private fun openJournal() {
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        if (launch == null) {
            Log.e(TAG, "the application has no launch activity to hand the capture to")
            return
        }
        launch.action = Intent.ACTION_VIEW
        launch.data = Uri.parse(LAUNCH_URI)
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        startActivity(launch)
    }

    private fun queue(text: String, subject: String?) {
        val record = StringBuilder()
            .append("{\"id\":\"").append(UUID.randomUUID().toString())
            .append("\",\"text\":").append(quote(text))
            .append(",\"title\":").append(if (subject.isNullOrBlank()) "null" else quote(subject))
            .append(",\"dateKey\":\"").append(todayKey())
            .append("\",\"source\":\"share\",\"capturedAt\":").append(System.currentTimeMillis())
            .append("}\n")
            .toString()
        try {
            File(filesDir, INBOX_FILE_NAME).appendText(record)
        } catch (error: Exception) {
            Log.e(TAG, "could not queue a shared capture", error)
        }
    }

    /** The device's local day as `YYYY-MM-DD`, matching `DateKey` in the shell. */
    private fun todayKey(): String {
        val now = Calendar.getInstance()
        return String.format(
            "%04d-%02d-%02d",
            now.get(Calendar.YEAR),
            now.get(Calendar.MONTH) + 1,
            now.get(Calendar.DAY_OF_MONTH),
        )
    }

    private fun quote(value: String): String {
        val out = StringBuilder(value.length + 2)
        out.append('"')
        for (character in value) {
            when {
                character == '"' -> out.append("\\\"")
                character == '\\' -> out.append("\\\\")
                character == '\n' -> out.append("\\n")
                character == '\r' -> out.append("\\r")
                character == '\t' -> out.append("\\t")
                character < ' ' -> out.append(String.format("\\u%04x", character.code))
                else -> out.append(character)
            }
        }
        out.append('"')
        return out.toString()
    }

    private companion object {
        const val TAG = "SkriuwCapture"
        const val INBOX_FILE_NAME = "skriuw-capture-inbox.jsonl"
        const val LAUNCH_URI = "skriuw:///journal?captured=1"
    }
}
