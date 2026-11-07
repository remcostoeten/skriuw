import Darwin
import ExpoModulesCore
import Foundation

let quickActionEvent = "onQuickAction"
let quickActionDelivered = Notification.Name("SkriuwPlatformQuickActionDelivered")

final class QuickActionInbox: @unchecked Sendable {
  static let shared = QuickActionInbox()

  private let lock = NSLock()
  private var pending: String?

  func deliver(_ type: String) {
    lock.lock()
    pending = type
    lock.unlock()
    NotificationCenter.default.post(name: quickActionDelivered, object: nil)
  }

  func take() -> String? {
    lock.lock()
    defer { lock.unlock() }
    let type = pending
    pending = nil
    return type
  }
}

final class LaunchClock: @unchecked Sendable {
  static let shared = LaunchClock()

  private let lock = NSLock()
  private var launchedAt: Date?
  private var foregroundAt: Date?

  func markLaunch() {
    lock.lock()
    defer { lock.unlock() }
    if launchedAt == nil {
      launchedAt = Date()
    }
  }

  func markForeground() {
    lock.lock()
    defer { lock.unlock() }
    if foregroundAt == nil {
      foregroundAt = Date()
    }
  }

  func launchDate() -> Date? {
    lock.lock()
    defer { lock.unlock() }
    return launchedAt
  }

  func foregroundDate() -> Date? {
    lock.lock()
    defer { lock.unlock() }
    return foregroundAt
  }
}

private let backgroundStartThreshold: TimeInterval = 5

private func processStartDate() -> Date? {
  var info = kinfo_proc()
  var size = MemoryLayout<kinfo_proc>.stride
  var name: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
  guard sysctl(&name, u_int(name.count), &info, &size, nil, 0) == 0 else {
    return nil
  }
  let start = info.kp_proc.p_starttime
  return Date(
    timeIntervalSince1970: TimeInterval(start.tv_sec) + TimeInterval(start.tv_usec) / 1_000_000
  )
}

public class SkriuwPlatformModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SkriuwPlatform")

    Events(quickActionEvent)

    OnStartObserving(quickActionEvent) {
      NotificationCenter.default.addObserver(
        self,
        selector: #selector(handleQuickActionDelivered),
        name: quickActionDelivered,
        object: nil
      )
    }

    OnStopObserving(quickActionEvent) {
      // swiftlint:disable:next notification_center_detachment
      NotificationCenter.default.removeObserver(self)
    }

    Function("takeQuickAction") { () -> String? in
      QuickActionInbox.shared.take()
    }

    // A prewarmed or background-launched process started long before the tap, so its clock is read from the first foreground instead.
    Function("launchTiming") { () -> [String: Any] in
      let now = Date()
      let clock = LaunchClock.shared
      let prewarmed = ProcessInfo.processInfo.environment["ActivePrewarm"] == "1"
      let foreground = clock.foregroundDate()
      if !prewarmed, let started = processStartDate(),
        foreground.map({ $0.timeIntervalSince(started) < backgroundStartThreshold }) ?? true
      {
        return ["elapsedMs": now.timeIntervalSince(started) * 1000, "anchor": "process-start"]
      }
      let anchor = foreground ?? clock.launchDate() ?? now
      return ["elapsedMs": now.timeIntervalSince(anchor) * 1000, "anchor": "app-launch"]
    }
  }

  @objc func handleQuickActionDelivered(_ notification: Notification) {
    guard let type = QuickActionInbox.shared.take() else {
      return
    }
    sendEvent(quickActionEvent, ["type": type])
  }
}
