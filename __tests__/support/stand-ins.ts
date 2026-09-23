import type { Plugin } from "vitest/config";

/**
 * Loads a stand-in wherever a listed source file would load, whatever
 * specifier reaches it. Keys and values are absolute paths.
 */
export function standIns(replacements: Readonly<Record<string, string>>): Plugin {
  return {
    name: "skriuw:stand-ins",
    enforce: "pre",
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (resolved === null) return null;
      return replacements[resolved.id] ?? null;
    },
  };
}
