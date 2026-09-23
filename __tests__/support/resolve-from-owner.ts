import { join, relative, sep } from "node:path";
import type { Plugin } from "vitest/config";

/**
 * Resolves bare imports in `__tests__/<path>` as if the test lived at `<path>`.
 *
 * Bun links each workspace's dependencies into that workspace's own
 * `node_modules`, so a suite under the root `__tests__` tree cannot find
 * `react` or `@skriuw/*` by walking up from its own directory. Resolving from
 * the mirrored path picks the owning package's copy, and falls back to the
 * repository root for shared tooling such as `vitest`.
 */
export function resolveFromOwner(repositoryDirectory: string): Plugin {
  const testsDirectory = join(repositoryDirectory, "__tests__") + sep;
  return {
    name: "skriuw:resolve-from-owner",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (importer === undefined || !importer.startsWith(testsDirectory)) return null;
      if (/^[./\0]/.test(source) || source.includes(":")) return null;
      const mirroredImporter = join(repositoryDirectory, relative(testsDirectory, importer));
      return this.resolve(source, mirroredImporter, { ...options, skipSelf: true });
    },
  };
}
