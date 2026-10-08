package dev.skriuw.core

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.net.HttpRetryException
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject
import uniffi.skriuw_mobile.MobileException
import uniffi.skriuw_mobile.MobileSync
import uniffi.skriuw_mobile.MobileSyncNetwork
import uniffi.skriuw_mobile.MobileSyncObserver
import uniffi.skriuw_mobile.MobileWorkspace
import uniffi.skriuw_mobile.NoteLockSecret
import uniffi.skriuw_mobile.SaveDocumentRequest
import uniffi.skriuw_mobile.SlotAdoption
import uniffi.skriuw_mobile.SyncRequest
import uniffi.skriuw_mobile.SyncResponse
import uniffi.skriuw_mobile.activeWorkspaceDirectory
import uniffi.skriuw_mobile.activeWorkspaceSlot
import uniffi.skriuw_mobile.adoptWorkspaceSlot
import uniffi.skriuw_mobile.workspaceProtocolVersion

class SaveDocumentArguments : Record {
  @Field var noteId: String = ""
  @Field var documentJson: String = ""
  @Field var markdown: String = ""
  @Field var expectedRevision: Double = 0.0
  @Field var at: Double = 0.0
}

class NoteLockSecretArguments : Record {
  @Field var kind: String = ""
  @Field var secret: String = ""
  @Field var hint: String? = null

  fun toSecret() = NoteLockSecret(kind = kind, secret = secret, hint = hint)
}

private class OpenWorkspace(
  val slot: String,
  val base: String,
  val handle: MobileWorkspace,
  val sync: MobileSync
)

private class ModuleFailure(val kind: String, override val message: String) : Exception(message)

private val slotPattern = Regex("^[a-z0-9][a-z0-9-]{0,63}$")

private const val SYNC_EVENT = "onSyncEvent"

private const val MAX_RESPONSE_BYTES = 4 * 1024 * 1024

private object PlatformSyncNetwork : MobileSyncNetwork {
  override fun send(request: SyncRequest): SyncResponse {
    val connection = try {
      URL(request.url).openConnection() as HttpURLConnection
    } catch (failure: IOException) {
      return failed(failure)
    }
    return try {
      val timeout = request.timeoutMs.toLong().coerceIn(1L, Int.MAX_VALUE.toLong()).toInt()
      connection.connectTimeout = timeout
      connection.readTimeout = timeout
      connection.requestMethod = request.method
      connection.instanceFollowRedirects = false
      connection.setRequestProperty("Authorization", "Bearer ${request.bearer}")
      connection.setRequestProperty("Accept", "application/json")
      request.contentType?.let { connection.setRequestProperty("Content-Type", it) }
      if (request.method == "POST" || request.method == "PUT") {
        connection.doOutput = true
        connection.setFixedLengthStreamingMode(request.body.size)
        connection.outputStream.use { it.write(request.body) }
      }
      val status = connection.responseCode
      val stream = if (status >= 400) connection.errorStream else connection.inputStream
      SyncResponse(
        status = status.toUShort(),
        retryAfterMs = connection.getHeaderField("Retry-After")?.trim()?.toLongOrNull()?.times(1_000),
        body = if (request.method == "HEAD") ByteArray(0) else readBounded(stream),
        transportError = null
      )
    } catch (refused: HttpRetryException) {
      // A streamed body cannot be resent, so a 401 surfaces as this exception rather than a status.
      SyncResponse(
        status = refused.responseCode().toUShort(),
        retryAfterMs = null,
        body = ByteArray(0),
        transportError = null
      )
    } catch (failure: IOException) {
      failed(failure)
    } finally {
      connection.disconnect()
    }
  }

  private fun failed(failure: IOException) = SyncResponse(
    status = 0u,
    retryAfterMs = null,
    body = ByteArray(0),
    transportError = failure.message ?: failure.javaClass.simpleName
  )

  // One byte past the limit is kept so the core still sees the body as oversized and refuses it.
  private fun readBounded(stream: InputStream?): ByteArray {
    if (stream == null) return ByteArray(0)
    stream.use { input ->
      val output = ByteArrayOutputStream()
      val buffer = ByteArray(16 * 1024)
      while (output.size() <= MAX_RESPONSE_BYTES) {
        val read = input.read(buffer)
        if (read < 0) break
        output.write(buffer, 0, read)
      }
      return output.toByteArray()
    }
  }
}

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

    AsyncFunction("noteLockState") Coroutine { ->
      offThread { workspace().noteLockState() }
    }

    AsyncFunction("configureNoteLock") Coroutine { arguments: NoteLockSecretArguments ->
      offThread { workspace().configureNoteLock(arguments.toSecret()) }
    }

    AsyncFunction("unlockNoteLock") Coroutine { secret: String ->
      offThread { workspace().unlockNoteLock(secret) }
    }

    AsyncFunction("recoverNoteLock") Coroutine { recoveryCode: String, arguments: NoteLockSecretArguments ->
      offThread { workspace().recoverNoteLock(recoveryCode, arguments.toSecret()) }
    }

    AsyncFunction("changeNoteLockSecret") Coroutine { arguments: NoteLockSecretArguments ->
      offThread { workspace().changeNoteLockSecret(arguments.toSecret()) }
    }

    AsyncFunction("relockNoteLock") Coroutine { ->
      offThread { workspace().relockNoteLock() }
    }

    AsyncFunction("readLockedDocuments") Coroutine { noteIds: List<String>? ->
      offThread { workspace().readLockedDocuments(noteIds) }
    }

    AsyncFunction("removeNoteLock") Coroutine { ->
      offThread { workspace().removeNoteLock() }
    }

    AsyncFunction("syncStatus") Coroutine { ->
      offThread { sync().status() }
    }

    AsyncFunction("connectSync") Coroutine { token: String, baseUrl: String ->
      offThread { sync().connect(token, baseUrl) }
    }

    AsyncFunction("pauseSync") Coroutine { ->
      offThread { sync().pause() }
    }

    AsyncFunction("catchUpSync") Coroutine { ->
      offThread { sync().catchUp() }
    }

    AsyncFunction("backgroundRefreshSync") Coroutine { ->
      offThread { sync().backgroundRefresh() }
    }

    AsyncFunction("setSyncForeground") Coroutine { foreground: Boolean ->
      offThread { sync().setForeground(foreground); null }
    }

    AsyncFunction("setSyncOnline") Coroutine { online: Boolean ->
      offThread { sync().setOnline(online); null }
    }

    AsyncFunction("setWakeChannelConnected") Coroutine { connected: Boolean ->
      offThread { sync().setWakeChannelConnected(connected); null }
    }

    AsyncFunction("notifyRemoteChange") Coroutine { ->
      offThread { sync().notifyRemoteChange(); null }
    }

    AsyncFunction("noteLocalCommit") Coroutine { ->
      offThread { sync().noteLocalCommit(); null }
    }

    AsyncFunction("wakeChannelUrl") Coroutine { ->
      offThread { sync().wakeChannelUrl() }
    }

    AsyncFunction("syncRecoveryView") Coroutine { ->
      offThread { sync().recoveryView() }
    }

    AsyncFunction("retryBlockedSyncOperation") Coroutine { blockedId: String ->
      offThread { sync().retryBlockedOperation(blockedId) }
    }

    AsyncFunction("discardBlockedSyncOperation") Coroutine { blockedId: String ->
      offThread { sync().discardBlockedOperation(blockedId) }
    }

    AsyncFunction("adoptWorkspaceSlot") Coroutine { workspaceId: String ->
      offThread { adopt(workspaceId) }
    }

    AsyncFunction("activeWorkspaceSlot") Coroutine { ->
      offThread { activeWorkspaceSlot(opened().base) }
    }

    AsyncFunction("shutdown") Coroutine { ->
      offThread { shutdown() }
    }

    Events(SYNC_EVENT)

    OnDestroy {
      current?.let { open ->
        runCatching { open.sync.shutdown() }
        open.sync.close()
        runCatching { open.handle.shutdown() }
        open.handle.close()
      }
      current = null
    }
  }

  private val observer = object : MobileSyncObserver {
    override fun statusChanged(statusJson: String) {
      sendEvent(SYNC_EVENT, mapOf("kind" to "status", "payload" to statusJson))
    }

    override fun workspaceChanged(changesJson: String) {
      sendEvent(SYNC_EVENT, mapOf("kind" to "workspaceChanged", "payload" to changesJson))
    }

    override fun sessionExpired() {
      sendEvent(SYNC_EVENT, mapOf("kind" to "sessionExpired", "payload" to null))
    }
  }

  private fun adopt(workspaceId: String): String {
    val open = opened()
    val route = adoptWorkspaceSlot(open.base, workspaceId, open.sync.linkedWorkspaceId())
    val adoption = when (route.adoption) {
      SlotAdoption.CLAIMED -> "claimed"
      SlotAdoption.ACTIVE -> "active"
      SlotAdoption.SWITCHED -> "switched"
    }
    return JSONObject()
      .put("adoption", adoption)
      .put("reopenRequired", route.reopenRequired)
      .toString()
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
    val base = File(File(context.filesDir, "workspaces"), slot).absolutePath
    val handle = MobileWorkspace.open(activeWorkspaceDirectory(base))
    val sync = try {
      MobileSync.open(handle.databasePath(), PlatformSyncNetwork, null, observer)
    } catch (failure: MobileException) {
      runCatching { handle.shutdown() }
      handle.close()
      throw failure
    }
    current = OpenWorkspace(slot, base, handle, sync)
    handle.databasePath()
  }

  private suspend fun shutdown(): Any? = lifecycle.withLock {
    val open = current ?: return@withLock null
    open.sync.shutdown()
    open.sync.close()
    open.handle.shutdown()
    open.handle.close()
    current = null
    null
  }

  private fun opened(): OpenWorkspace =
    current ?: throw ModuleFailure("closed", "workspace is closed")

  private fun workspace(): MobileWorkspace = opened().handle

  private fun sync(): MobileSync = opened().sync

  private fun describe(failure: MobileException): Map<String, Any?> {
    val message = failure.message ?: failure.toString()
    return when (failure) {
      is MobileException.Workspace -> mapOf("kind" to "workspace", "message" to message)
      is MobileException.Recovery -> mapOf("kind" to "recovery", "message" to message)
      is MobileException.InvalidPayload -> mapOf("kind" to "invalid-payload", "message" to message)
      is MobileException.Rejected -> mapOf("kind" to "rejected", "message" to failure.detail)
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
