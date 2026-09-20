package dev.skriuw.core

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import uniffi.skriuw_mobile.MobileException
import uniffi.skriuw_mobile.MobileWorkspace
import uniffi.skriuw_mobile.SaveDocumentRequest
import uniffi.skriuw_mobile.workspaceProtocolVersion

class SaveDocumentArguments : Record {
  @Field var noteId: String = ""
  @Field var documentJson: String = ""
  @Field var markdown: String = ""
  @Field var expectedRevision: Double = 0.0
  @Field var at: Double = 0.0
}

private class OpenWorkspace(val slot: String, val handle: MobileWorkspace)

private class ModuleFailure(val kind: String, override val message: String) : Exception(message)

private val slotPattern = Regex("^[a-z0-9][a-z0-9-]{0,63}$")

class SkriuwCoreModule : Module() {
  private val lifecycle = Mutex()
  @Volatile private var current: OpenWorkspace? = null

  override fun definition() = ModuleDefinition {
    Name("SkriuwCore")

    AsyncFunction("protocolVersion") Coroutine { ->
      offThread { workspaceProtocolVersion().toInt() }
    }

    AsyncFunction("open") Coroutine { slot: String ->
      offThread { open(slot) }
    }

    AsyncFunction("bootstrap") Coroutine { ->
      offThread { workspace().bootstrap() }
    }

    AsyncFunction("submitOperations") Coroutine { operationsJson: String ->
      offThread { workspace().submitOperations(operationsJson) }
    }

    AsyncFunction("loadDocument") Coroutine { noteId: String ->
      offThread { workspace().loadDocument(noteId) }
    }

    AsyncFunction("saveDocument") Coroutine { arguments: SaveDocumentArguments ->
      offThread {
        workspace().saveDocument(
          SaveDocumentRequest(
            noteId = arguments.noteId,
            documentJson = arguments.documentJson,
            markdown = arguments.markdown,
            expectedRevision = arguments.expectedRevision.toLong(),
            at = arguments.at.toLong()
          )
        )
      }
    }

    AsyncFunction("shutdown") Coroutine { ->
      offThread { shutdown() }
    }

    OnDestroy {
      current?.handle?.let { handle ->
        runCatching { handle.shutdown() }
        handle.close()
      }
      current = null
    }
  }

  private suspend fun offThread(call: suspend () -> Any?): Map<String, Any?> =
    withContext(Dispatchers.IO) {
      try {
        mapOf("ok" to true, "value" to call())
      } catch (failure: MobileException) {
        mapOf("ok" to false, "error" to describe(failure))
      } catch (failure: ModuleFailure) {
        mapOf("ok" to false, "error" to mapOf("kind" to failure.kind, "message" to failure.message))
      }
    }

  private suspend fun open(slot: String): String = lifecycle.withLock {
    if (!slotPattern.matches(slot)) {
      throw ModuleFailure("invalid-slot", "workspace slot must match ${slotPattern.pattern}")
    }
    current?.let { open ->
      if (open.slot == slot) {
        return@withLock open.handle.databasePath()
      }
      throw ModuleFailure(
        "slot-in-use",
        "workspace slot ${open.slot} is open; call shutdown before opening $slot"
      )
    }

    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    val directory = File(File(context.filesDir, "workspaces"), slot)
    val handle = MobileWorkspace.open(directory.absolutePath)
    current = OpenWorkspace(slot, handle)
    handle.databasePath()
  }

  private suspend fun shutdown(): Any? = lifecycle.withLock {
    val open = current ?: return@withLock null
    open.handle.shutdown()
    open.handle.close()
    current = null
    null
  }

  private fun workspace(): MobileWorkspace =
    current?.handle ?: throw ModuleFailure("closed", "workspace is closed")

  private fun describe(failure: MobileException): Map<String, Any?> {
    val message = failure.message ?: failure.toString()
    return when (failure) {
      is MobileException.Workspace -> mapOf("kind" to "workspace", "message" to message)
      is MobileException.Recovery -> mapOf("kind" to "recovery", "message" to message)
      is MobileException.InvalidPayload -> mapOf("kind" to "invalid-payload", "message" to message)
      is MobileException.Rejected -> mapOf("kind" to "rejected", "message" to message)
      is MobileException.UnsupportedProtocol -> mapOf(
        "kind" to "unsupported-protocol",
        "message" to message,
        "version" to failure.version.toInt()
      )
      is MobileException.Conflict -> mapOf(
        "kind" to "conflict",
        "message" to message,
        "id" to failure.id,
        "expected" to failure.expected.toDouble(),
        "current" to failure.current.toDouble()
      )
      is MobileException.NotFound -> mapOf("kind" to "not-found", "message" to message, "id" to failure.id)
      is MobileException.AlreadyExists -> mapOf(
        "kind" to "already-exists",
        "message" to message,
        "id" to failure.id
      )
      is MobileException.Busy -> mapOf("kind" to "busy", "message" to message)
      is MobileException.Closed -> mapOf("kind" to "closed", "message" to message)
      is MobileException.Sync -> mapOf("kind" to "sync", "message" to message)
      is MobileException.SessionExpired -> mapOf("kind" to "session-expired", "message" to message)
      is MobileException.UntrustedCloud -> mapOf("kind" to "untrusted-cloud", "message" to message)
      is MobileException.WorkspaceMismatch -> mapOf(
        "kind" to "workspace-mismatch",
        "message" to message,
        "linked" to failure.linked,
        "account" to failure.account
      )
      is MobileException.Internal -> mapOf("kind" to "internal", "message" to message)
    }
  }
}
