import { resolve } from "node:path";
import type { Plugin } from "vite";

const sourceDirectory = resolve(import.meta.dirname, "../../src");
const standaloneDirectory = resolve(sourceDirectory, "features/editor-standalone");

/**
 * @name standaloneEditorBridge
 * @description Swaps the two bridge modules every editor command funnels
 * through for protocol-backed stand-ins, so the standalone editor reuses the
 * editor feature unforked and takes no new props. Matching on the resolved
 * file covers both the `@/platform/...` alias and the relative imports inside
 * `platform/runtime/`.
 *
 * @example
 * defineConfig({ plugins: [standaloneEditorBridge(), react()] });
 */
export function standaloneEditorBridge(): Plugin {
  const swaps = new Map([
    [
      resolve(sourceDirectory, "platform/runtime/runtime.ts"),
      resolve(standaloneDirectory, "port-runtime.ts"),
    ],
    [
      resolve(sourceDirectory, "platform/runtime/external-links.ts"),
      resolve(standaloneDirectory, "port-external-links.ts"),
    ],
  ]);
  return {
    name: "skriuw-standalone-editor-bridge",
    enforce: "pre",
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return (resolved && swaps.get(resolved.id)) ?? null;
    },
  };
}
