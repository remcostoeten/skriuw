import ExpoModulesCore
import UIKit

public class SkriuwPlatformAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    LaunchClock.shared.markLaunch()
    return true
  }

  public func applicationWillEnterForeground(_ application: UIApplication) {
    LaunchClock.shared.markForeground()
  }

  // ExpoAppSceneDelegate forwards both the cold-start and the running quick action here.
  public func application(
    _ application: UIApplication,
    performActionFor shortcutItem: UIApplicationShortcutItem,
    completionHandler: @escaping (Bool) -> Void
  ) {
    QuickActionInbox.shared.deliver(shortcutItem.type)
    completionHandler(true)
  }
}
