import ExpoModulesCore
import Foundation

struct SaveDocumentArguments: Record {
  @Field var noteId: String = ""
  @Field var documentJson: String = ""
  @Field var markdown: String = ""
  @Field var expectedRevision: Double = 0
  @Field var at: Double = 0
}

struct NoteLockSecretArguments: Record {
  @Field var kind: String = ""
  @Field var secret: String = ""
  @Field var hint: String? = nil

  func toSecret() -> NoteLockSecret {
    NoteLockSecret(kind: kind, secret: secret, hint: hint)
  }
}

private struct ModuleFailure: Error {
  let kind: String
  let message: String
}

private final class OpenWorkspace {
  let slot: String
  let base: String
  let handle: MobileWorkspace
  let sync: MobileSync

  init(slot: String, base: String, handle: MobileWorkspace, sync: MobileSync) {
    self.slot = slot
    self.base = base
    self.handle = handle
    self.sync = sync
  }
}

private let syncEvent = "onSyncEvent"

private let maxResponseBytes = 4 * 1024 * 1024

private final class PlatformSyncNetwork: MobileSyncNetwork, @unchecked Sendable {
  private let session: URLSession = {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpCookieStorage = nil
    configuration.urlCache = nil
    return URLSession(configuration: configuration)
  }()

  func send(request: SyncRequest) throws -> SyncResponse {
    guard let url = URL(string: request.url) else {
      return Self.failed("invalid sync URL")
    }
    var outbound = URLRequest(url: url)
    outbound.httpMethod = request.method
    outbound.timeoutInterval = TimeInterval(request.timeoutMs) / 1000
    outbound.setValue("Bearer \(request.bearer)", forHTTPHeaderField: "Authorization")
    outbound.setValue("application/json", forHTTPHeaderField: "Accept")
    if let contentType = request.contentType {
      outbound.setValue(contentType, forHTTPHeaderField: "Content-Type")
    }
    if request.method == "POST" || request.method == "PUT" {
      outbound.httpBody = request.body
    }

    // The core calls this from its own sync thread and expects it to block until the exchange settles.
    let done = DispatchSemaphore(value: 0)
    var answer = Self.failed("the request did not complete")
    let task = session.dataTask(with: outbound) { data, response, error in
      defer { done.signal() }
      if let error {
        answer = Self.failed(error.localizedDescription)
        return
      }
      guard let response = response as? HTTPURLResponse else {
        answer = Self.failed("the response was not HTTP")
        return
      }
      let retryAfter = (response.value(forHTTPHeaderField: "Retry-After"))
        .flatMap { Int64($0.trimmingCharacters(in: .whitespaces)) }
        .map { $0 * 1000 }
      let body = data ?? Data()
      answer = SyncResponse(
        status: UInt16(clamping: response.statusCode),
        retryAfterMs: retryAfter,
        body: body.count > maxResponseBytes ? body.prefix(maxResponseBytes + 1) : body,
        transportError: nil
      )
    }
    task.resume()
    done.wait()
    return answer
  }

  private static func failed(_ detail: String) -> SyncResponse {
    SyncResponse(status: 0, retryAfterMs: nil, body: Data(), transportError: detail)
  }
}

private final class SyncObserver: MobileSyncObserver, @unchecked Sendable {
  private let emit: (String, String?) -> Void

  init(emit: @escaping (String, String?) -> Void) {
    self.emit = emit
  }

  func statusChanged(statusJson: String) {
    emit("status", statusJson)
  }

  func workspaceChanged(changesJson: String) {
    emit("workspaceChanged", changesJson)
  }

  func sessionExpired() {
    emit("sessionExpired", nil)
  }
}

public final class SkriuwCoreModule: Module {
  private static let slotPattern = "^[a-z0-9][a-z0-9-]{0,63}$"

  private let lifecycle = NSLock()
  private var current: OpenWorkspace?
  private let network = PlatformSyncNetwork()
  private lazy var observer = SyncObserver { [weak self] kind, payload in
    self?.sendEvent(syncEvent, ["kind": kind, "payload": payload])
  }

  public func definition() -> ModuleDefinition {
    Name("SkriuwCore")

    AsyncFunction("protocolVersion") { () -> [String: Any?] in
      self.settle { Int(workspaceProtocolVersion()) }
    }

    AsyncFunction("open") { (slot: String) -> [String: Any?] in
      self.settle { try self.open(slot: slot) }
    }

    AsyncFunction("bootstrap") { () -> [String: Any?] in
      self.settle { try self.workspace().bootstrap() }
    }

    AsyncFunction("submitOperations") { (operationsJson: String) -> [String: Any?] in
      self.settle { try self.workspace().submitOperations(operationsJson: operationsJson) }
    }

    AsyncFunction("loadDocument") { (noteId: String) -> [String: Any?] in
      self.settle { try self.workspace().loadDocument(noteId: noteId) }
    }

    AsyncFunction("saveDocument") { (arguments: SaveDocumentArguments) -> [String: Any?] in
      self.settle {
        try self.workspace().saveDocument(
          request: SaveDocumentRequest(
            noteId: arguments.noteId,
            documentJson: arguments.documentJson,
            markdown: arguments.markdown,
            expectedRevision: Int64(arguments.expectedRevision),
            at: Int64(arguments.at)
          )
        )
      }
    }

    AsyncFunction("noteLockState") { () -> [String: Any?] in
      self.settle { try self.workspace().noteLockState() }
    }

    AsyncFunction("configureNoteLock") { (arguments: NoteLockSecretArguments) -> [String: Any?] in
      self.settle { try self.workspace().configureNoteLock(secret: arguments.toSecret()) }
    }

    AsyncFunction("unlockNoteLock") { (secret: String) -> [String: Any?] in
      self.settle { try self.workspace().unlockNoteLock(secret: secret) }
    }

    AsyncFunction("recoverNoteLock") {
      (recoveryCode: String, arguments: NoteLockSecretArguments) -> [String: Any?] in
      self.settle {
        try self.workspace().recoverNoteLock(
          recoveryCode: recoveryCode,
          replacement: arguments.toSecret()
        )
      }
    }

    AsyncFunction("changeNoteLockSecret") { (arguments: NoteLockSecretArguments) -> [String: Any?] in
      self.settle { try self.workspace().changeNoteLockSecret(replacement: arguments.toSecret()) }
    }

    AsyncFunction("relockNoteLock") { () -> [String: Any?] in
      self.settle { try self.workspace().relockNoteLock() }
    }

    AsyncFunction("readLockedDocuments") { (noteIds: [String]?) -> [String: Any?] in
      self.settle { try self.workspace().readLockedDocuments(noteIds: noteIds) }
    }

    AsyncFunction("removeNoteLock") { () -> [String: Any?] in
      self.settle { try self.workspace().removeNoteLock() }
    }

    AsyncFunction("syncStatus") { () -> [String: Any?] in
      self.settle { try self.sync().status() }
    }

    AsyncFunction("connectSync") { (token: String, baseUrl: String) -> [String: Any?] in
      self.settle { try self.sync().connect(token: token, baseUrl: baseUrl) }
    }

    AsyncFunction("pauseSync") { () -> [String: Any?] in
      self.settle { try self.sync().pause() }
    }

    AsyncFunction("catchUpSync") { () -> [String: Any?] in
      self.settle { try self.sync().catchUp() }
    }

    AsyncFunction("backgroundRefreshSync") { () -> [String: Any?] in
      self.settle { try self.sync().backgroundRefresh() }
    }

    AsyncFunction("setSyncForeground") { (foreground: Bool) -> [String: Any?] in
      self.settle { try self.sync().setForeground(foreground: foreground) }
    }

    AsyncFunction("setSyncOnline") { (online: Bool) -> [String: Any?] in
      self.settle { try self.sync().setOnline(online: online) }
    }

    AsyncFunction("setWakeChannelConnected") { (connected: Bool) -> [String: Any?] in
      self.settle { try self.sync().setWakeChannelConnected(connected: connected) }
    }

    AsyncFunction("notifyRemoteChange") { () -> [String: Any?] in
      self.settle { try self.sync().notifyRemoteChange() }
    }

    AsyncFunction("noteLocalCommit") { () -> [String: Any?] in
      self.settle { try self.sync().noteLocalCommit() }
    }

    AsyncFunction("wakeChannelUrl") { () -> [String: Any?] in
      self.settle { try self.sync().wakeChannelUrl() }
    }

    AsyncFunction("syncRecoveryView") { () -> [String: Any?] in
      self.settle { try self.sync().recoveryView() }
    }

    AsyncFunction("retryBlockedSyncOperation") { (blockedId: String) -> [String: Any?] in
      self.settle { try self.sync().retryBlockedOperation(blockedId: blockedId) }
    }

    AsyncFunction("discardBlockedSyncOperation") { (blockedId: String) -> [String: Any?] in
      self.settle { try self.sync().discardBlockedOperation(blockedId: blockedId) }
    }

    AsyncFunction("adoptWorkspaceSlot") { (workspaceId: String) -> [String: Any?] in
      self.settle { try self.adopt(workspaceId: workspaceId) }
    }

    AsyncFunction("activeWorkspaceSlot") { () -> [String: Any?] in
      self.settle { try activeWorkspaceSlot(baseDirectory: self.opened().base) }
    }

    AsyncFunction("shutdown") { () -> [String: Any?] in
      self.settle { try self.shutdown() }
    }

    Events(syncEvent)

    OnDestroy {
      try? self.shutdown()
    }
  }

  private func settle(_ call: () throws -> Any?) -> [String: Any?] {
    do {
      return ["ok": true, "value": try call()]
    } catch let failure as MobileError {
      return ["ok": false, "error": describe(failure)]
    } catch let failure as ModuleFailure {
      return ["ok": false, "error": ["kind": failure.kind, "message": failure.message]]
    } catch {
      return ["ok": false, "error": ["kind": "internal", "message": error.localizedDescription]]
    }
  }

  private func open(slot: String) throws -> String {
    lifecycle.lock()
    defer { lifecycle.unlock() }

    guard slot.range(of: Self.slotPattern, options: .regularExpression) != nil else {
      throw ModuleFailure(kind: "invalid-slot", message: "workspace slot must match \(Self.slotPattern)")
    }
    if let open = current {
      if open.slot == slot {
        return open.handle.databasePath()
      }
      throw ModuleFailure(
        kind: "slot-in-use",
        message: "workspace slot \(open.slot) is open; call shutdown before opening \(slot)"
      )
    }

    let support = try FileManager.default.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    let base = support.appendingPathComponent("workspaces").appendingPathComponent(slot).path
    let handle = try MobileWorkspace.open(directory: try activeWorkspaceDirectory(baseDirectory: base))
    let sync: MobileSync
    do {
      sync = try MobileSync.open(
        databasePath: handle.databasePath(),
        network: network,
        assets: nil,
        observer: observer
      )
    } catch {
      try? handle.shutdown()
      throw error
    }
    current = OpenWorkspace(slot: slot, base: base, handle: handle, sync: sync)
    return handle.databasePath()
  }

  private func shutdown() throws {
    lifecycle.lock()
    defer { lifecycle.unlock() }

    guard let open = current else {
      return
    }
    open.sync.shutdown()
    try open.handle.shutdown()
    current = nil
  }

  private func opened() throws -> OpenWorkspace {
    lifecycle.lock()
    defer { lifecycle.unlock() }

    guard let open = current else {
      throw ModuleFailure(kind: "closed", message: "workspace is closed")
    }
    return open
  }

  private func workspace() throws -> MobileWorkspace {
    try opened().handle
  }

  private func sync() throws -> MobileSync {
    try opened().sync
  }

  private func adopt(workspaceId: String) throws -> String {
    let open = try opened()
    let route = try adoptWorkspaceSlot(
      baseDirectory: open.base,
      workspaceId: workspaceId,
      linkedWorkspaceId: try open.sync.linkedWorkspaceId()
    )
    let adoption: String
    switch route.adoption {
    case .claimed: adoption = "claimed"
    case .active: adoption = "active"
    case .switched: adoption = "switched"
    }
    let payload: [String: Any] = ["adoption": adoption, "reopenRequired": route.reopenRequired]
    let data = try JSONSerialization.data(withJSONObject: payload)
    return String(decoding: data, as: UTF8.self)
  }

  private func describe(_ failure: MobileError) -> [String: Any?] {
    let message = failure.localizedDescription
    switch failure {
    case .Workspace:
      return ["kind": "workspace", "message": message]
    case .Recovery:
      return ["kind": "recovery", "message": message]
    case .InvalidPayload:
      return ["kind": "invalid-payload", "message": message]
    case let .Rejected(detail):
      return ["kind": "rejected", "message": detail]
    case let .UnsupportedProtocol(version):
      return ["kind": "unsupported-protocol", "message": message, "version": Int(version)]
    case let .Conflict(id, expected, current):
      return [
        "kind": "conflict",
        "message": message,
        "id": id,
        "expected": Double(expected),
        "current": Double(current),
      ]
    case let .NotFound(id):
      return ["kind": "not-found", "message": message, "id": id]
    case let .AlreadyExists(id):
      return ["kind": "already-exists", "message": message, "id": id]
    case .Busy:
      return ["kind": "busy", "message": message]
    case .Closed:
      return ["kind": "closed", "message": message]
    case .Sync:
      return ["kind": "sync", "message": message]
    case .SessionExpired:
      return ["kind": "session-expired", "message": message]
    case .UntrustedCloud:
      return ["kind": "untrusted-cloud", "message": message]
    case let .WorkspaceMismatch(linked, account):
      return [
        "kind": "workspace-mismatch",
        "message": message,
        "linked": linked,
        "account": account,
      ]
    case .Internal:
      return ["kind": "internal", "message": message]
    }
  }
}
