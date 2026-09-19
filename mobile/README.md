# Skriuw mobile

The iOS and Android client for the v2 workspace. Architecture decision:
[ADR-0048](../docs/adr/0048-native-mobile-shell-over-shared-core.md).
Implementation contract: [docs/specs/mobile-app.md](../docs/specs/mobile-app.md).

This is the scaffold. Routes live in `app/`; everything else lives in `src/`.
The native module, the shared renderer core, the bridge adapter and the editor
host arrive with the later issues in the **Mobile app** milestone.

## Commands

Dependencies are installed once from the repository root with `bun install`;
`app/`, `mobile/` and `shared/*` are bun workspaces.

```bash
bun run mobile              # expo start, from the repository root
./scripts/check-mobile.sh   # the product gate: typecheck and unit tests
```

From this directory, `bun run android`, `bun run ios` and `bun run web` start
Expo on a single platform.

Android is the local verification target. iOS cannot be built or simulated on
Linux; its evidence comes from EAS builds.
