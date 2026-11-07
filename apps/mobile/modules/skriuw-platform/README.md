# skriuw-platform

The Expo module for the operating-system hooks the mobile shell needs outside
the Rust core. Requirements: [docs/specs/mobile-app.md](../../../../docs/specs/mobile-app.md),
R-F8 (home-screen quick actions) and R-P4 (cold start).

Expo autolinks everything under `apps/mobile/modules/`, so the application
needs no dependency entry: `import { skriuwPlatform } from "../modules/skriuw-platform"`.
The native module is optional; a build without it (the web preview, an older
development client) gets `null` from every call.

## Surface

| Call | Result |
| --- | --- |
| `takeQuickAction()` | the type of the quick action that launched or resumed the app, once; always `null` on Android |
| `subscribeQuickActions(listener)` | an unsubscribe; the listener receives quick actions pressed while the app runs |
| `launchTiming()` | `{ elapsedMs, anchor }` since this launch began, or `null` |

## Quick actions

The items themselves are declared by `src/features/quick-actions/plugin.js`.
On iOS, `SkriuwPlatformAppDelegate` receives the pressed item from
`ExpoAppSceneDelegate`, which forwards both a cold-start item and one pressed
while running, and holds it until JavaScript takes it. Android shortcuts open a
`skriuw://quick-action/<type>` link instead, which `app/+native-intent.tsx`
reads, so the Android module never has one pending.

## Launch timing

`anchor` is `process-start` when the process was started by the launch itself.
It is `app-launch` when iOS prewarmed the process or launched it in the
background earlier, detected by `ActivePrewarm` or by a first foreground more
than five seconds after the process started; the time then counts from that
first foreground.
