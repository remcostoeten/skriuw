# Expo Foundation

The Expo app now exists as a sibling workspace to the web app and is usable in guest mode.

## Current shape

- The web app remains at the repository root.
- The Expo app lives in `apps/mobile`.
- Root TypeScript excludes the mobile workspace.
- Root scripts expose separate web and mobile entry points.

## What ships on mobile now

- bottom-tab app structure for `Notes`, `Journal`, and `Profile`
- local guest workspace persisted with AsyncStorage
- seeded starter notes, folders, and journal entries
- note create, edit, and delete flow
- journal create, edit, mood/tag update, and delete flow
- profile summary with workspace metrics and reset action
- cloud-readiness surface that detects whether Expo public Supabase env vars are present

## What is still intentionally missing

- authenticated mobile sign-in
- cloud repository wiring
- shared extracted core package used by both web and mobile
- account/profile actions beyond guest metrics and reset

## Next extraction targets

The next useful refactor is to move platform-neutral logic behind a shared package boundary:

- note, folder, journal, and profile types
- repository contracts
- guest starter-data builders
- cloud starter-data builders
- validation and view-model helpers that do not depend on Next or browser APIs

## Product model to preserve

- guest users use local-only storage on device
- authenticated users use private cloud data scoped to their account
- guest and authenticated flows stay conceptually aligned across web and mobile
