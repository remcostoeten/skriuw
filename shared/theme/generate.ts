import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export type GeneratedTheme = {
  name: string;
  dark: boolean;
  tokens: Record<string, string>;
};

const THEME_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = join(THEME_DIR, "../..");
const SOURCE_PATH = join(REPO_DIR, "app/src/themes.css");
const OUTPUT_PATH = join(THEME_DIR, "tokens.ts");

const NON_COLOR_TOKENS = new Set(["radius"]);
const BLOCK_PATTERN = /((?::root[^{},]*,\s*)*:root\[data-theme="[^"]+"\])\s*\{([^}]*)\}/g;
const THEME_NAME_PATTERN = /data-theme="([^"]+)"/g;
const DECLARATION_PATTERN = /--([a-z0-9-]+)\s*:\s*([^;]+);/g;
const REFERENCE_PATTERN = /^var\(--([a-z0-9-]+)\)$/;
const COMMENT_PATTERN = /\/\*[\s\S]*?\*\//g;
const TRIPLE_PATTERN = /^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/;

function parseDeclarations(body: string): Map<string, string> {
  const declarations = new Map<string, string>();
  for (const [, name, value] of body.matchAll(DECLARATION_PATTERN)) {
    declarations.set(name, value.trim());
  }
  return declarations;
}

function resolveValue(
  theme: string,
  name: string,
  declarations: Map<string, string>,
  visited: readonly string[] = [],
): string {
  const value = declarations.get(name);
  if (value === undefined) {
    throw new Error(`${theme}: --${visited.at(-1)} references undefined --${name}`);
  }
  const reference = REFERENCE_PATTERN.exec(value);
  if (!reference) return value;
  if (visited.includes(name)) {
    throw new Error(`${theme}: circular var() chain through --${name}`);
  }
  return resolveValue(theme, reference[1], declarations, [...visited, name]);
}

function buildTheme(name: string, declarations: Map<string, string>): GeneratedTheme {
  const tokens: Record<string, string> = {};
  let backgroundLightness: number | undefined;
  for (const token of declarations.keys()) {
    if (NON_COLOR_TOKENS.has(token)) continue;
    const resolved = resolveValue(name, token, declarations);
    const triple = TRIPLE_PATTERN.exec(resolved);
    if (!triple) {
      throw new Error(`${name}: --${token} resolves to "${resolved}", not an HSL triple`);
    }
    const [, hue, saturation, lightness] = triple;
    tokens[token] = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    if (token === "background") backgroundLightness = Number(lightness);
  }
  if (backgroundLightness === undefined) {
    throw new Error(`${name}: --background is required to derive the dark flag`);
  }
  return { name, dark: backgroundLightness < 50, tokens };
}

/** Parses every `:root[data-theme]` block into resolved `hsl()` tokens. */
export function parseThemes(css: string): GeneratedTheme[] {
  const themes: GeneratedTheme[] = [];
  for (const [, selector, body] of css.replace(COMMENT_PATTERN, "").matchAll(BLOCK_PATTERN)) {
    const declarations = parseDeclarations(body);
    for (const [, name] of selector.matchAll(THEME_NAME_PATTERN)) {
      if (themes.some((theme) => theme.name === name)) {
        throw new Error(`${name}: declared in more than one block`);
      }
      themes.push(buildTheme(name, declarations));
    }
  }
  if (themes.length === 0) throw new Error("no :root[data-theme] blocks found");

  const expected = Object.keys(themes[0].tokens);
  for (const theme of themes) {
    const actual = new Set(Object.keys(theme.tokens));
    const missing = expected.filter((token) => !actual.has(token));
    const extra = [...actual].filter((token) => !expected.includes(token));
    if (missing.length > 0 || extra.length > 0) {
      throw new Error(
        `${theme.name}: token set differs from ${themes[0].name} (missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"})`,
      );
    }
  }
  return themes;
}

/** Renders the committed `tokens.ts` module for the parsed themes. */
export function renderTokens(themes: readonly GeneratedTheme[]): string {
  const tokenNames = Object.keys(themes[0].tokens);
  const lines = [
    "// Generated from app/src/themes.css by shared/theme/generate.ts.",
    "// Do not edit by hand. Run ./scripts/generate.sh",
    "",
    `export const THEME_NAMES = ${JSON.stringify(themes.map((theme) => theme.name))} as const;`,
    "",
    "export type ThemeName = (typeof THEME_NAMES)[number];",
    "",
    "export const TOKEN_NAMES = [",
    ...tokenNames.map((token) => `  ${JSON.stringify(token)},`),
    "] as const;",
    "",
    "export type TokenName = (typeof TOKEN_NAMES)[number];",
    "",
    "export type ThemeTokens = Record<TokenName, string>;",
    "",
    "export const DARK_THEMES: Record<ThemeName, boolean> = {",
    ...themes.map((theme) => `  ${JSON.stringify(theme.name)}: ${theme.dark},`),
    "};",
    "",
    "export const THEME_TOKENS: Record<ThemeName, ThemeTokens> = {",
  ];
  for (const theme of themes) {
    lines.push(`  ${JSON.stringify(theme.name)}: {`);
    for (const token of tokenNames) {
      lines.push(`    ${JSON.stringify(token)}: ${JSON.stringify(theme.tokens[token])},`);
    }
    lines.push("  },");
  }
  lines.push("};", "");
  return lines.join("\n");
}

function readCommitted(): string | undefined {
  try {
    return readFileSync(OUTPUT_PATH, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function main(): void {
  const check = process.argv.includes("--check");
  const expected = renderTokens(parseThemes(readFileSync(SOURCE_PATH, "utf8")));
  const output = relative(REPO_DIR, OUTPUT_PATH);
  if (check) {
    if (readCommitted() !== expected) {
      console.error(`generated theme tokens are stale: ${output}. Run ./scripts/generate.sh`);
      process.exit(1);
    }
    return;
  }
  writeFileSync(OUTPUT_PATH, expected);
  console.log(`generated ${output}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
