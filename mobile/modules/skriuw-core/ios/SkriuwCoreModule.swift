import ExpoModulesCore
import Foundation

struct SaveDocumentArguments: Record {
  @Field var noteId: String = ""
  @Field var documentJson: String = ""
  @Field var markdown: String = ""
  @Field var expectedRevision: Double = 0
  @Field var at: Double = 0
}

private struct ModuleFailure: Error {
  let kind: String
  let message: String
}

private final class OpenWorkspace {
  let slot: String
  let handle: MobileWorkspace

  init(slot: String, handle: MobileWorkspace) {
    self.slot = slot
    self.handle = handle
  }
}

public final class SkriuwCoreModule: Module {
  private static let slotPattern = "^[a-z0-9][a-z0-9-]{0,63}$"

  private let lifecycle = NSLock()
  private var current: OpenWorkspace?

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

    AsyncFunction("shutdown") { () -> [String: Any?] in
      self.settle { try self.shutdown() }
    }

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
    let directory = support.appendingPathComponent("workspaces").appendingPathComponent(slot)
    let handle = try MobileWorkspace.open(directory: directory.path)
    current = OpenWorkspace(slot: slot, handle: handle)
    return handle.databasePath()
  }

  private func shutdown() throws {
    lifecycle.lock()
    defer { lifecycle.unlock() }

    guard let open = current else {
      return
    }
    try open.handle.shutdown()
    current = nil
  }

  private func workspace() throws -> MobileWorkspace {
    lifecycle.lock()
    defer { lifecycle.unlock() }

    guard let open = current else {
      throw ModuleFailure(kind: "closed", message: "workspace is closed")
    }
    return open.handle
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
    case .Rejected:
      return ["kind": "rejected", "message": message]
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
    case .Internal:
      return ["kind": "internal", "message": message]
    }
  }
}
