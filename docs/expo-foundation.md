# Expo Foundation

This branch starts the Expo app as a sibling workspace to the existing web app.

## Current shape

- The web app remains at the repository root.
- The Expo app lives in `apps/mobile`.
- Root TypeScript no longer attempts to type-check the mobile workspace.
- Root scripts now expose separate web and mobile entry points.

## Intent

This is a foundation branch, not a mobile feature port.

The immediate goals are:

- establish a real Expo workspace next to the web app
- keep the existing web app stable
- avoid moving Next-specific assumptions into the mobile shell
- create a clean place to extract shared domain and data modules next

## Next extraction targets

The next useful refactor is to move shared, platform-neutral logic behind a package boundary:

- note, folder, journal, and profile types
- repository contracts
- guest starter-data builders
- cloud starter-data builders
- validation and view-model helpers that do not depend on Next or browser APIs

## Product model to preserve

- guest users use local-only storage on device
- authenticated users use private cloud data scoped to their account
- guest and authenticated flows should stay conceptually the same across web and mobile
