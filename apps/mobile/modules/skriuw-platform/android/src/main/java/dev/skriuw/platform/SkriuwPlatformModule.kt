package dev.skriuw.platform

import android.os.Process
import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SkriuwPlatformModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SkriuwPlatform")

    Events("onQuickAction")

    // Android quick actions arrive as skriuw:// links through expo-router, so nothing is ever pending here.
    Function("takeQuickAction") { null as String? }

    Function("launchTiming") {
      mapOf(
        "elapsedMs" to (SystemClock.elapsedRealtime() - Process.getStartElapsedRealtime()).toDouble(),
        "anchor" to "process-start",
      )
    }
  }
}
