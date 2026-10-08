import type { WorkspaceSettings } from "@skriuw/renderer-core/contracts/workspace";

export type MathMacros = Record<string, string>;
export type MathMacrosDraft = { ok: true; macros: MathMacros } | { ok: false; message: string };

export const EMPTY_MATH_MACROS: MathMacros = {};
const settingsCache = new WeakMap<WorkspaceSettings, MathMacros>();
const definitionCache = new WeakMap<object, MathMacros>();
const encoder = new TextEncoder();

/**
 * @name mathMacrosFromSettings
 * @description Reads bounded workspace macro definitions at the settings boundary.
 * @example
 * mathMacrosFromSettings(store.getState().settings);
 */
export function mathMacrosFromSettings(settings: WorkspaceSettings): MathMacros {
  const cached = settingsCache.get(settings);
  if (cached) return cached;
  const value = settings.mathMacros;
  const macros: MathMacros = {};
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const existing = definitionCache.get(value);
    if (existing) {
      settingsCache.set(settings, existing);
      return existing;
    }
    const entries = Object.entries(value);
    if (entries.length <= 64) {
      for (const [name, definition] of entries) {
        if (
          /^\\[a-zA-Z]+$/.test(name) &&
          name.length <= 64 &&
          typeof definition === "string" &&
          encoder.encode(definition).length <= 4096
        ) {
          macros[name] = definition;
        }
      }
    }
  }
  const result = Object.keys(macros).length === 0 ? EMPTY_MATH_MACROS : macros;
  if (value !== null && typeof value === "object") definitionCache.set(value, result);
  settingsCache.set(settings, result);
  return result;
}

/**
 * @name parseMathMacrosDraft
 * @description Parses one backslash command and TeX definition per line, with actionable input errors.
 * @example
 * parseMathMacrosDraft("\\R = \\mathbb{R}");
 */
export function parseMathMacrosDraft(source: string): MathMacrosDraft {
  const macros: MathMacros = {};
  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (!line) continue;
    const separator = line.indexOf("=");
    const name = line.slice(0, separator).trim();
    if (separator === -1 || !/^\\[a-zA-Z]+$/.test(name) || name.length > 64) {
      return {
        ok: false,
        message: `Line ${index + 1}: use a command such as \\R followed by = and its TeX definition.`,
      };
    }
    const definition = line.slice(separator + 1).trim();
    if (!definition || encoder.encode(definition).length > 4096) {
      return { ok: false, message: `Line ${index + 1}: enter a definition of 1 to 4096 bytes.` };
    }
    if (name in macros)
      return { ok: false, message: `Line ${index + 1}: ${name} is defined twice.` };
    macros[name] = definition;
  }
  if (Object.keys(macros).length > 64) return { ok: false, message: "Use at most 64 math macros." };
  return { ok: true, macros };
}
