export type MermaidFamily = "flowchart" | "sequence" | "state" | "class" | "er" | "unsupported";

export type MermaidPalette = {
  bg: string;
  fg: string;
  line: string;
  accent: string;
  muted: string;
  surface: string;
  border: string;
};

export type MermaidRenderOptions = {
  animate: boolean;
  font: string;
};

export type MermaidRenderResult =
  | { ok: true; svg: string; width: number; height: number }
  | { ok: false; message: string };

export type MermaidRenderer = (
  source: string,
  palette: MermaidPalette,
  options: MermaidRenderOptions,
) => Promise<MermaidRenderResult>;

type LibraryRender = (source: string, options: Record<string, unknown>) => Promise<string>;

export const RENDERABLE_MERMAID_FAMILIES: readonly Exclude<MermaidFamily, "unsupported">[] = [
  "flowchart",
  "sequence",
  "state",
  "class",
  "er",
];

export const MERMAID_UNSUPPORTED_NOTE =
  "Rendering supports flowchart, sequence, state, class, and ER diagrams.";

export const MERMAID_FAMILY_LABELS: Record<MermaidFamily, string> = {
  flowchart: "Flowchart",
  sequence: "Sequence diagram",
  state: "State diagram",
  class: "Class diagram",
  er: "Entity relationship diagram",
  unsupported: "Diagram",
};

const RENDER_CACHE_LIMIT = 64;
const DEFAULT_FONT = "system-ui";
const FONT_SIZE = 14;
const EDGE_FONT_SIZE = 11;

const FALLBACK_PALETTE: MermaidPalette = {
  bg: "hsl(2 0% 7%)",
  fg: "hsl(0 0% 91%)",
  line: "hsl(0 0% 55%)",
  accent: "hsl(0 0% 91%)",
  muted: "hsl(0 0% 55%)",
  surface: "hsl(0 0% 9%)",
  border: "hsl(0 0% 18%)",
};

const PALETTE_TOKENS: Record<keyof MermaidPalette, string> = {
  bg: "--background",
  fg: "--foreground",
  line: "--muted-foreground",
  accent: "--foreground",
  muted: "--muted-foreground",
  surface: "--card",
  border: "--border",
};

const renderCache = new Map<string, MermaidRenderResult>();
let libraryPromise: Promise<LibraryRender> | null = null;

export function mermaidHeaderLine(source: string): string {
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("%%")) continue;
    return line;
  }
  return "";
}

export function detectMermaidFamily(source: string): MermaidFamily {
  const header = mermaidHeaderLine(source);
  if (/^(graph|flowchart)\b/i.test(header)) return "flowchart";
  if (/^sequenceDiagram\b/i.test(header)) return "sequence";
  if (/^stateDiagram(-v2)?\b/i.test(header)) return "state";
  if (/^classDiagram\b/i.test(header)) return "class";
  if (/^erDiagram\b/i.test(header)) return "er";
  return "unsupported";
}

export function isMermaidFence(language: string): boolean {
  const name = language.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return name === "mermaid" || name === "diagram";
}

export function isRenderableMermaidFence(language: string, source: string): boolean {
  return isMermaidFence(language) && detectMermaidFamily(source) !== "unsupported";
}

/**
 * Converts a theme token value (`"210 40% 96%"` triplets as written in
 * `themes.css`, or any complete CSS color) into a color string the renderer
 * can put straight into an SVG `style` attribute.
 */
export function hslTripletToColor(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (/^-?[\d.]+\s+[\d.]+%\s+[\d.]+%$/.test(trimmed)) return `hsl(${trimmed})`;
  if (/^[\d.]+\s+[\d.]+%\s+[\d.]+%\s*\/\s*[\d.%]+$/.test(trimmed)) return `hsl(${trimmed})`;
  return trimmed;
}

export function readMermaidPalette(root: HTMLElement | null): MermaidPalette {
  const computed =
    root && typeof globalThis.getComputedStyle === "function"
      ? globalThis.getComputedStyle(root)
      : null;
  const palette = { ...FALLBACK_PALETTE };
  if (!computed) return palette;
  for (const key of Object.keys(PALETTE_TOKENS) as (keyof MermaidPalette)[]) {
    const color = hslTripletToColor(computed.getPropertyValue(PALETTE_TOKENS[key]));
    if (color) palette[key] = color;
  }
  return palette;
}

/**
 * The first family of a `font-family` stack, unquoted. The renderer quotes the
 * family it is given, so passing a whole stack would produce one bogus name.
 */
export function primaryFontFamily(stack: string): string {
  const first =
    stack
      .split(",")[0]
      ?.trim()
      .replace(/^["']|["']$/g, "") ?? "";
  return first === "" ? DEFAULT_FONT : first;
}

/**
 * The library's SVG is trusted code, but it embeds user text and a Google Fonts
 * `@import` that the desktop CSP blocks. Both are removed before `innerHTML`.
 */
export function sanitizeMermaidSvg(svg: string): string {
  return svg
    .replace(/^\s*@import\s+url\([^)]*\)\s*;?\s*$/gm, "")
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(href|xlink:href)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, "");
}

function svgDimension(svg: string, name: "width" | "height"): number {
  const match = new RegExp(`<svg\\b[^>]*\\s${name}="([^"]+)"`).exec(svg);
  const value = match ? Number.parseFloat(match[1] ?? "") : Number.NaN;
  return Number.isFinite(value) ? value : 0;
}

function cacheKey(source: string, palette: MermaidPalette, options: MermaidRenderOptions): string {
  return JSON.stringify([source, palette, options.animate, options.font]);
}

function remember(key: string, result: MermaidRenderResult): MermaidRenderResult {
  if (renderCache.size >= RENDER_CACHE_LIMIT) {
    const oldest = renderCache.keys().next().value;
    if (oldest !== undefined) renderCache.delete(oldest);
  }
  renderCache.set(key, result);
  return result;
}

export function mermaidRenderCacheSize(): number {
  return renderCache.size;
}

export function clearMermaidRenderCache(): void {
  renderCache.clear();
}

function loadLibrary(): Promise<LibraryRender> {
  libraryPromise ??= import("@vercel/beautiful-mermaid").then(
    (module) => module.renderMermaid as LibraryRender,
  );
  return libraryPromise;
}

function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw.trim();
  return message === "" ? "The diagram could not be rendered." : message;
}

export async function renderMermaidSvg(
  source: string,
  palette: MermaidPalette,
  options: MermaidRenderOptions,
  render: LibraryRender | null = null,
): Promise<MermaidRenderResult> {
  const key = cacheKey(source, palette, options);
  const cached = renderCache.get(key);
  if (cached) return cached;
  if (detectMermaidFamily(source) === "unsupported") {
    return remember(key, { ok: false, message: MERMAID_UNSUPPORTED_NOTE });
  }
  try {
    const renderer = render ?? (await loadLibrary());
    const raw = await renderer(source, {
      ...palette,
      transparent: true,
      font: options.font,
      fontSize: FONT_SIZE,
      edgeFontSize: EDGE_FONT_SIZE,
      letterSpacing: 0,
      cornerRadius: 4,
      animate: options.animate,
    });
    const svg = sanitizeMermaidSvg(raw);
    const width = svgDimension(svg, "width");
    const height = svgDimension(svg, "height");
    if (width <= 0 || height <= 0) {
      return remember(key, { ok: false, message: "The diagram has nothing to draw yet." });
    }
    return remember(key, { ok: true, svg, width, height });
  } catch (error) {
    return remember(key, { ok: false, message: errorMessage(error) });
  }
}

export type MermaidTemplate = {
  id: string;
  family: Exclude<MermaidFamily, "unsupported" | "flowchart">;
  label: string;
  subtext: string;
  aliases: readonly string[];
  source: string;
  /** Offset into `source` of the first token a user is expected to replace. */
  caret: number;
};

function template(
  id: MermaidTemplate["id"],
  family: MermaidTemplate["family"],
  label: string,
  subtext: string,
  aliases: readonly string[],
  source: string,
  firstToken: string,
): MermaidTemplate {
  return { id, family, label, subtext, aliases, source, caret: source.indexOf(firstToken) };
}

export const mermaidTemplates: readonly MermaidTemplate[] = [
  template(
    "sequence-diagram",
    "sequence",
    "Sequence diagram",
    "Messages between participants, rendered from Mermaid",
    ["sequence", "mermaid", "messages", "participants"],
    "sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi",
    "Alice",
  ),
  template(
    "state-diagram",
    "state",
    "State diagram",
    "States and transitions, rendered from Mermaid",
    ["state", "mermaid", "transitions", "machine"],
    "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running: start\n  Running --> [*]",
    "Idle",
  ),
  template(
    "class-diagram",
    "class",
    "Class diagram",
    "Classes and relations, rendered from Mermaid",
    ["class", "mermaid", "uml", "model"],
    "classDiagram\n  class Note {\n    +string title\n    +open()\n  }\n  Note --> Tag",
    "Note",
  ),
  template(
    "er-diagram",
    "er",
    "ER diagram",
    "Entities and relationships, rendered from Mermaid",
    ["er", "mermaid", "entity", "relationship", "database"],
    "erDiagram\n  NOTE ||--o{ TAG : has",
    "NOTE",
  ),
];
