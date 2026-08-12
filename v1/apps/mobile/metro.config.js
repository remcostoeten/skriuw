// Metro config tuned for a bun/pnpm monorepo.
// Watches the workspace root so `packages/domain` (@skriuw/domain) resolves
// once the Phase 0 extraction lands.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo.
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from the app first, then the workspace root, then bun's
// flattened package store — bun only symlinks *direct* dependencies into each
// workspace's node_modules, so transitive deps (e.g. expo's own dependency on
// expo-modules-core) only exist under bun's internal `.bun/node_modules`.
// This is last in the list so the app/root copies of shared deps (react,
// react-native) always win and this is only reached as a fallback.
config.resolver.nodeModulesPaths = [
	path.resolve(projectRoot, "node_modules"),
	path.resolve(workspaceRoot, "node_modules"),
	path.resolve(workspaceRoot, "node_modules/.bun/node_modules"),
];

// 3. Prevent duplicate React copies from being bundled.
config.resolver.disableHierarchicalLookup = true;

// 4. Metro defaults this to false; better-auth's client subpaths (e.g.
// "better-auth/react") are declared only via package.json "exports", so
// without this Metro can't see them at all.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
