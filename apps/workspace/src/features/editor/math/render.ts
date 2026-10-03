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
};

const RENDER_CACHE_LIMIT = 256;
const MAX_SIZE_EM = 20;
const MAX_EXPAND = 500;

const renderCache = new Map<string, MathRenderResult>();
let katexPromise: Promise<KatexRender> | null = null;

function cacheKey(tex: string, displayMode: boolean): string {
  return `${displayMode ? "display" : "inline"}\u0000${tex}`;
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
  katexPromise ??= Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(
    ([module]) => module.default.renderToString,
  );
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
export function cachedMathRender(tex: string, displayMode: boolean): MathRenderResult | null {
  return renderCache.get(cacheKey(tex, displayMode)) ?? null;
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
): Promise<MathRenderResult> {
  const key = cacheKey(tex, displayMode);
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
    });
    return remember(key, { ok: true, html });
  } catch (error) {
    return remember(key, { ok: false, message: mathErrorMessage(error) });
  }
}
