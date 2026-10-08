import { EMPTY_MATH_MACROS, type MathMacros } from "./macros";

export type MathRenderResult = { ok: true; html: string } | { ok: false; message: string };

export type MathRenderer = (tex: string, displayMode: boolean) => Promise<MathRenderResult>;

type KatexRender = (tex: string, options: KatexOptions) => string;

type KatexOptions = {
  displayMode: boolean;
  throwOnError: boolean;
  output: "htmlAndMathml";
  trust: false;
  strict: "ignore";
  maxSize: number;
  maxExpand: number;
  macros: MathMacros;
};

const RENDER_CACHE_LIMIT = 256;
const MAX_SIZE_EM = 20;
const MAX_EXPAND = 500;

const renderCache = new Map<string, MathRenderResult>();
const macroVersions = new WeakMap<MathMacros, number>();
let macroVersionSequence = 0;
let katexPromise: Promise<KatexRender> | null = null;

function cacheKey(tex: string, displayMode: boolean, macros: MathMacros): string {
  let version = macroVersions.get(macros);
  if (version === undefined) {
    version = ++macroVersionSequence;
    macroVersions.set(macros, version);
  }
  return `${version}\u0000${displayMode ? "display" : "inline"}\u0000${tex}`;
}

function remember(key: string, result: MathRenderResult): MathRenderResult {
  if (renderCache.size >= RENDER_CACHE_LIMIT) {
    const oldest = renderCache.keys().next().value;
    if (oldest !== undefined) renderCache.delete(oldest);
  }
  renderCache.set(key, result);
  return result;
}

function loadKatex(): Promise<KatexRender> {
  katexPromise ??= Promise.all([
    import("katex"),
    import("katex/dist/katex.min.css"),
    import("katex/contrib/mhchem"),
  ]).then(([module]) => module.default.renderToString);
  return katexPromise;
}

/**
 * @name mathErrorMessage
 * @description Turns a KaTeX parse error into the short sentence shown under a
 * math node, dropping the library prefix and the echoed source excerpt.
 *
 * @example
 * mathErrorMessage(new Error("KaTeX parse error: Expected 'EOF', got '}' at position 3: x^}̲"));
 * // "Expected 'EOF', got '}' at position 3"
 */
export function mathErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw
    .replace(/^KaTeX parse error:\s*/, "")
    .replace(/(at position \d+):[\s\S]*$/, "$1")
    .trim();
  return message === "" ? "This TeX could not be rendered." : message;
}

/**
 * @name cachedMathRender
 * @description Returns an earlier render of the same TeX and mode without
 * loading or running KaTeX, so revisiting a note paints its math in the same
 * frame.
 *
 * @example
 * const hit = cachedMathRender("x^2", false);
 * if (hit?.ok) element.innerHTML = hit.html;
 */
export function cachedMathRender(
  tex: string,
  displayMode: boolean,
  macros: MathMacros = EMPTY_MATH_MACROS,
): MathRenderResult | null {
  return renderCache.get(cacheKey(tex, displayMode, macros)) ?? null;
}

export function clearMathRenderCache(): void {
  renderCache.clear();
}

/**
 * @name renderMath
 * @description Renders TeX to KaTeX HTML with MathML for assistive technology.
 * KaTeX and its stylesheet load on the first call, never at startup. Results
 * are memoized, and parse errors resolve to a message instead of throwing.
 *
 * @example
 * const result = await renderMath("\\frac{a}{b}", true);
 * if (result.ok) preview.innerHTML = result.html;
 */
export async function renderMath(
  tex: string,
  displayMode: boolean,
  render: KatexRender | null = null,
  macros: MathMacros = EMPTY_MATH_MACROS,
): Promise<MathRenderResult> {
  const key = cacheKey(tex, displayMode, macros);
  const cached = renderCache.get(key);
  if (cached) return cached;
  try {
    const renderer = render ?? (await loadKatex());
    const html = renderer(tex, {
      displayMode,
      throwOnError: true,
      output: "htmlAndMathml",
      trust: false,
      strict: "ignore",
      maxSize: MAX_SIZE_EM,
      maxExpand: MAX_EXPAND,
      macros: { ...macros },
    });
    return remember(key, { ok: true, html });
  } catch (error) {
    return remember(key, { ok: false, message: mathErrorMessage(error) });
  }
}

/**
 * @name validateMathMacros
 * @description Expands each macro with sample arguments before settings are saved.
 * @example
 * await validateMathMacros({ "\\R": "\\mathbb{R}" });
 */
export async function validateMathMacros(macros: MathMacros): Promise<string | null> {
  for (const [name, definition] of Object.entries(macros)) {
    const argumentCount = Math.max(
      0,
      ...Array.from(definition.matchAll(/#([1-9])/g), (match) => Number(match[1])),
    );
    const result = await renderMath(name + "{x}".repeat(argumentCount), false, null, macros);
    if (!result.ok)
      return `${name}: ${result.message}. Check its TeX definition and referenced commands.`;
  }
  return null;
}
